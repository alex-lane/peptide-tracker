// Repo helpers for CalendarFeedSettings — one row per (scope, subject) pair.
// We auto-create rows on demand so the UI can render a default config without
// the user explicitly opting in.

import type { CalendarFeedSettings, PeptideDb } from '@/db';
import { newId, nowIso } from '@/db';

const HEX = '0123456789abcdef';

/** Issue a fresh token nonce (32 bytes of entropy, hex-encoded). */
export function issueNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) {
    out += HEX[b >> 4]!;
    out += HEX[b & 0xf]!;
  }
  return out;
}

export async function getOrCreateUserFeed(
  db: PeptideDb,
  householdId: string,
  userId: string,
): Promise<CalendarFeedSettings> {
  const existing = await db.calendarFeedSettings
    .where('[householdId+scope+userId]')
    .equals([householdId, 'user', userId])
    .first();
  if (existing) return existing;
  const row: CalendarFeedSettings = {
    id: newId(),
    householdId,
    scope: 'user',
    userId,
    enabled: true,
    privacy: 'generic',
    includeDose: false,
    includeProtocolName: false,
    includeProductName: false,
    includeReminders: false,
    updatedAt: nowIso(),
  };
  await db.calendarFeedSettings.put(row);
  return row;
}

export async function getOrCreateHouseholdFeed(
  db: PeptideDb,
  householdId: string,
): Promise<CalendarFeedSettings> {
  const existing = await db.calendarFeedSettings
    .where('[householdId+scope+userId]')
    .equals([householdId, 'household', ''])
    .first();
  if (existing) return existing;
  const row: CalendarFeedSettings = {
    id: newId(),
    householdId,
    scope: 'household',
    enabled: false,
    privacy: 'minimal',
    includeDose: false,
    includeProtocolName: false,
    includeProductName: false,
    includeReminders: false,
    updatedAt: nowIso(),
  };
  await db.calendarFeedSettings.put(row);
  return row;
}

export async function updateFeed(
  db: PeptideDb,
  patch: Partial<CalendarFeedSettings> & { id: string },
): Promise<CalendarFeedSettings> {
  const existing = await db.calendarFeedSettings.get(patch.id);
  if (!existing) throw new Error(`No feed settings row ${patch.id}`);
  const merged: CalendarFeedSettings = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  await db.calendarFeedSettings.put(merged);
  return merged;
}

export async function rotateFeedToken(
  db: PeptideDb,
  feedId: string,
): Promise<CalendarFeedSettings> {
  return updateFeed(db, {
    id: feedId,
    feedToken: issueNonce(),
    feedTokenIssuedAt: nowIso(),
  });
}

export async function revokeFeedToken(
  db: PeptideDb,
  feedId: string,
): Promise<CalendarFeedSettings> {
  return updateFeed(db, {
    id: feedId,
    // Empty string means "no current token"; the row is preserved so the
    // user's privacy/include flags survive a revoke→reissue cycle.
    feedToken: '',
    feedTokenIssuedAt: undefined,
  });
}
