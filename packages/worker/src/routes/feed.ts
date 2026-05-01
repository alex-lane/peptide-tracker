// GET /feed/user/:userId.ics?token=...
// GET /feed/household/:householdId.ics?token=...
//
// Public endpoint (no Access JWT) — authorization is via the HMAC-signed
// token in the query string. The token's `feedId` points at a
// CalendarFeedSettings row whose `feedToken` field acts as a per-feed nonce
// — rotating that nonce invalidates every previously-issued token for the
// same row, even though they were all signed with the same env secret.
//
// Returns ICS with ETag (sha-256 of body) + Cache-Control: max-age=900.

import { Hono, type Context } from 'hono';
import {
  buildEventsForFeed,
  generateIcs,
  importHmacKey,
  verifyFeedToken,
  FeedTokenError,
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
  if (!env.FEED_HMAC_KEY) return text(503, 'FEED_HMAC_KEY not configured.');

  const token = c.req.query('token');
  if (!token) return text(401, 'Missing token.');

  // Validate signature.
  const key = await importHmacKey(env.FEED_HMAC_KEY);
  let payload;
  try {
    payload = await verifyFeedToken(key, token);
  } catch (err) {
    if (err instanceof FeedTokenError) {
      const status = err.kind === 'expired' ? 410 : 401;
      return text(status, err.message);
    }
    return text(401, 'Bad token.');
  }

  if (payload.scope !== scope) return text(403, 'Token scope does not match path.');

  const rawParam =
    scope === 'user' ? c.req.param('userId') : c.req.param('householdId');
  // The route regex captures the param including the ".ics" extension; strip it.
  const subjectId = rawParam ? rawParam.replace(/\.ics$/, '') : '';
  if (!subjectId || subjectId !== payload.subjectId) {
    return text(403, 'Token subject does not match path.');
  }

  const feed = await fetchFeed(env.DB, payload.feedId);
  if (!feed || !feed.enabled) return text(404, 'Feed disabled or missing.');
  if (!feed.feedToken || feed.feedToken.length === 0) {
    return text(401, 'Feed has no active token.');
  }
  // Per-feed nonce check — rotation invalidates old tokens.
  if (typeof payload.subjectId !== 'string' || !samePath(feed, scope, subjectId)) {
    return text(403, 'Feed metadata does not match token.');
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

  // 304 short-circuit for unchanged content.
  if (c.req.header('if-none-match') === `"${etag}"`) {
    return new Response(null, { status: 304, headers: { ETag: `"${etag}"` } });
  }

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      ETag: `"${etag}"`,
    },
  });
}

function samePath(feed: CalendarFeedSettings, scope: FeedScope, subjectId: string): boolean {
  if (feed.scope !== scope) return false;
  if (scope === 'user') return feed.userId === subjectId;
  return feed.householdId === subjectId;
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// ─── D1 lookups ────────────────────────────────────────────────────────

async function fetchFeed(
  db: NonNullable<Env['DB']>,
  feedId: string,
): Promise<CalendarFeedSettings | undefined> {
  const spec = TABLES.calendarFeedSettings;
  const row = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE id = ? LIMIT 1`)
    .bind(feedId)
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
