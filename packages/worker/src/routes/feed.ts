// GET /feed/user/:userId.ics?token=...
// GET /feed/household/:householdId.ics?token=...
//
// Public endpoint (no Cloudflare Access JWT) — authorization is via the
// opaque per-feed nonce in the query string. The Worker compares the
// supplied token to `CalendarFeedSettings.feedToken` (the only row matching
// the URL's scope + subject); rotating that column from the Settings UI
// invalidates every previously-issued URL.
//
// We deliberately do NOT use HMAC signatures here — the nonce IS the secret.
// Equivalent security in this trust model: traffic is HTTPS, only the Worker
// writes `feedToken`, and every request reads the row anyway. Future-work
// `feedToken.ts` HMAC plumbing in @peptide/domain stays for offline-verifiable
// tokens if and when that becomes useful.
//
// Returns ICS with ETag (sha-256 of body) + Cache-Control: max-age=900.

import { Hono, type Context } from 'hono';
import {
  buildEventsForFeed,
  generateIcs,
  type CalendarFeedSettings,
  type Household,
  type InventoryItem,
  type Protocol,
  type ProtocolItem,
  type UserProfile,
} from '@peptide/domain';
import { TABLES } from '../db/tables.js';
import { decodeRow } from '../db/codec.js';
import type { Env } from '../index.js';

const CACHE_SECONDS = 900;

export function feedRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  // The `.ics` extension is matched literally; the param strips it via regex.
  app.get('/feed/user/:userId{.+\\.ics}', async (c) => handleFeed(c, 'user'));
  app.get('/feed/household/:householdId{.+\\.ics}', async (c) =>
    handleFeed(c, 'household'),
  );

  return app;
}

type FeedScope = 'user' | 'household';

async function handleFeed(
  c: Context<{ Bindings: Env }>,
  scope: FeedScope,
): Promise<Response> {
  const env = c.env;
  if (!env.DB) return text(503, 'D1 binding missing.');

  const token = c.req.query('token');
  if (!token) return text(401, 'Missing token.');

  const rawParam =
    scope === 'user' ? c.req.param('userId') : c.req.param('householdId');
  // The route regex captures the param including the ".ics" extension; strip it.
  const subjectId = rawParam ? rawParam.replace(/\.ics$/, '') : '';
  if (!subjectId) return text(400, 'Missing subject id.');

  const feed = await fetchFeedBySubject(env.DB, scope, subjectId);
  if (!feed || !feed.enabled) return text(404, 'Feed disabled or missing.');
  if (!feed.feedToken) return text(401, 'Feed has no active token.');

  if (!constantTimeEquals(feed.feedToken, token)) {
    return text(401, 'Bad token.');
  }

  const householdId = feed.householdId;
  const [household, users, protocols, inventoryItems] = await Promise.all([
    fetchHousehold(env.DB, householdId),
    fetchUsers(env.DB, householdId),
    fetchProtocols(env.DB, householdId),
    fetchInventoryItems(env.DB, householdId),
  ]);
  if (!household) return text(404, 'Household missing.');
  // protocol_items has no household_id (child of protocol). Fetch by
  // protocol_id one at a time — small set, no JOIN needed.
  const protocolItems: ProtocolItem[] = [];
  for (const p of protocols) {
    protocolItems.push(...(await fetchProtocolItemsForProtocol(env.DB, p.id)));
  }

  const events = buildEventsForFeed({
    settings: feed,
    users,
    protocols,
    protocolItems,
    inventoryItems,
  });

  const calendarName =
    feed.scope === 'user'
      ? `${users.find((u) => u.id === feed.userId)?.displayName ?? 'User'} — ${household.name}`
      : `${household.name} — household`;

  const ics = generateIcs({
    calendarName,
    privacy: feed.privacy,
    events,
  });

  const etag = await sha256Hex(ics);
  const cacheControl = `public, max-age=${CACHE_SECONDS}`;

  // 304 short-circuit for unchanged content. Per RFC 7232 §4.1, mirror the
  // cache headers the 200 would have set so downstream caches stay aligned.
  if (c.req.header('if-none-match') === `"${etag}"`) {
    return new Response(null, {
      status: 304,
      headers: { ETag: `"${etag}"`, 'Cache-Control': cacheControl },
    });
  }

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': cacheControl,
      ETag: `"${etag}"`,
    },
  });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Length-safe comparison that always walks both strings to mitigate timing leaks. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// ─── D1 lookups ────────────────────────────────────────────────────────

async function fetchFeedBySubject(
  db: NonNullable<Env['DB']>,
  scope: FeedScope,
  subjectId: string,
): Promise<CalendarFeedSettings | undefined> {
  const spec = TABLES.calendarFeedSettings;
  const subjectColumn = scope === 'user' ? 'user_id' : 'household_id';
  const row = await db
    .prepare(
      `SELECT * FROM ${spec.table} WHERE scope = ? AND ${subjectColumn} = ? LIMIT 1`,
    )
    .bind(scope, subjectId)
    .first<Record<string, unknown>>();
  return row ? (decodeRow(spec, row) as CalendarFeedSettings) : undefined;
}

async function fetchHousehold(
  db: NonNullable<Env['DB']>,
  householdId: string,
): Promise<Household | undefined> {
  const spec = TABLES.household;
  const row = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE id = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(householdId)
    .first<Record<string, unknown>>();
  return row ? (decodeRow(spec, row) as Household) : undefined;
}

async function fetchUsers(
  db: NonNullable<Env['DB']>,
  householdId: string,
): Promise<UserProfile[]> {
  const spec = TABLES.userProfile;
  const result = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE household_id = ? AND deleted_at IS NULL`)
    .bind(householdId)
    .all<Record<string, unknown>>();
  return result.results.map((r) => decodeRow(spec, r) as UserProfile);
}

async function fetchProtocols(
  db: NonNullable<Env['DB']>,
  householdId: string,
): Promise<Protocol[]> {
  const spec = TABLES.protocol;
  const result = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE household_id = ? AND deleted_at IS NULL`)
    .bind(householdId)
    .all<Record<string, unknown>>();
  return result.results.map((r) => decodeRow(spec, r) as Protocol);
}

async function fetchProtocolItemsForProtocol(
  db: NonNullable<Env['DB']>,
  protocolId: string,
): Promise<ProtocolItem[]> {
  const spec = TABLES.protocolItem;
  const result = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE protocol_id = ?`)
    .bind(protocolId)
    .all<Record<string, unknown>>();
  return result.results.map((r) => decodeRow(spec, r) as ProtocolItem);
}

async function fetchInventoryItems(
  db: NonNullable<Env['DB']>,
  householdId: string,
): Promise<InventoryItem[]> {
  const spec = TABLES.inventoryItem;
  const result = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE household_id = ? AND deleted_at IS NULL`)
    .bind(householdId)
    .all<Record<string, unknown>>();
  return result.results.map((r) => decodeRow(spec, r) as InventoryItem);
}
