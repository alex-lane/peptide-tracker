// Refreshes the upcoming `doseSchedules` rows for a Protocol's items.
//
// Strategy:
//  - For each ProtocolItem in the given Protocol, expand its (rrule, tzid,
//    localStartTime) into UTC instants within [now, now + horizonDays).
//  - Upsert one DoseSchedule per occurrence, keyed by (protocolItemId,
//    scheduledFor). Existing rows in the same window with status 'pending'
//    that no longer correspond to a current occurrence are removed (the
//    user might have changed the RRULE; we don't want stale pending rows).
//  - 'logged' / 'skipped' rows are NEVER touched — they are user history.
//
// The full refresh runs inside a single Dexie transaction across
// (doseSchedules, outbox) so that the visible state is consistent.

import { expandSchedule } from '@peptide/domain';
import type { DoseSchedule, PeptideDb, Protocol, ProtocolItem } from '@/db';
import { newId, nowIso } from '@/db';

export interface RefreshArgs {
  /** Now (UTC). Defaults to `new Date()`. Inject for tests. */
  now?: Date;
  /** Days of look-ahead. PLAN says 60. */
  horizonDays?: number;
}

export interface RefreshResult {
  inserted: number;
  removed: number;
  kept: number;
  /** Per-item breakdown for surfacing in the review panel. */
  perItem: Array<{ protocolItemId: string; occurrences: number }>;
}

const DEFAULT_HORIZON_DAYS = 60;

export async function refreshSchedulesForProtocol(
  db: PeptideDb,
  protocol: Protocol,
  items: readonly ProtocolItem[],
  args: RefreshArgs = {},
): Promise<RefreshResult> {
  if (!protocol.active) {
    // Inactive protocol → wipe its pending rows and return.
    return wipePendingForProtocol(db, items);
  }

  const now = args.now ?? new Date();
  const horizonDays = args.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const windowStart = new Date(now.getTime());
  const windowEnd = new Date(now.getTime() + horizonDays * 24 * 3600_000);

  // protocol.startDate may be in the future; clamp window from the left.
  const protocolStart = new Date(`${protocol.startDate}T00:00:00.000Z`);
  if (protocolStart.getTime() > windowStart.getTime()) {
    windowStart.setTime(protocolStart.getTime());
  }
  // protocol.endDate (if set) caps the window from the right.
  if (protocol.endDate) {
    const protocolEnd = new Date(`${protocol.endDate}T23:59:59.999Z`);
    if (protocolEnd.getTime() < windowEnd.getTime()) {
      windowEnd.setTime(protocolEnd.getTime());
    }
  }

  if (windowEnd.getTime() <= windowStart.getTime()) {
    return wipePendingForProtocol(db, items);
  }

  // Compute desired (protocolItemId, scheduledFor) set.
  type Want = { item: ProtocolItem; scheduledFor: string };
  const wanted: Want[] = [];
  const perItem: RefreshResult['perItem'] = [];

  for (const item of items) {
    const occ = expandSchedule({
      rrule: item.rrule,
      tzid: item.timezone,
      localStartDate: protocol.startDate,
      localStartTime: item.localStartTime,
      windowStart,
      windowEnd,
      ...(item.cycle ? { cycle: item.cycle } : {}),
    });
    perItem.push({ protocolItemId: item.id, occurrences: occ.length });
    for (const o of occ) {
      wanted.push({ item, scheduledFor: o.instant.toISOString() });
    }
  }

  let inserted = 0;
  let removed = 0;
  let kept = 0;

  await db.transaction('rw', db.doseSchedules, db.outbox, async () => {
    // Existing pending rows for these protocol items in the window.
    const itemIds = items.map((i) => i.id);
    const existing = await db.doseSchedules
      .where('householdId')
      .equals(protocol.householdId)
      .toArray();
    const existingForUs = existing.filter(
      (s) =>
        !s.deletedAt &&
        s.protocolItemId &&
        itemIds.includes(s.protocolItemId) &&
        s.status === 'pending' &&
        s.scheduledFor >= windowStart.toISOString() &&
        s.scheduledFor <= windowEnd.toISOString(),
    );

    const existingKey = (s: DoseSchedule): string => `${s.protocolItemId}|${s.scheduledFor}`;
    const wantKey = (w: Want): string => `${w.item.id}|${w.scheduledFor}`;
    const existingByKey = new Map(existingForUs.map((s) => [existingKey(s), s]));
    const wantedByKey = new Map(wanted.map((w) => [wantKey(w), w]));

    // Remove pending existing rows that are no longer wanted.
    for (const [key, row] of existingByKey) {
      if (!wantedByKey.has(key)) {
        const stamped: DoseSchedule = {
          ...row,
          deletedAt: nowIso(),
          updatedAt: nowIso(),
          version: row.version + 1,
        };
        await db.doseSchedules.put(stamped);
        await db.outbox.add({
          mutationId: newId(),
          entity: 'doseSchedule',
          op: 'delete',
          payload: { id: row.id, deletedAt: stamped.deletedAt },
          createdAt: nowIso(),
          retryCount: 0,
          lastError: null,
          ackedAt: null,
        });
        removed += 1;
      } else {
        kept += 1;
      }
    }

    // Insert rows that are wanted but not yet existing.
    for (const [key, w] of wantedByKey) {
      if (existingByKey.has(key)) continue;
      const row: DoseSchedule = {
        id: newId(),
        householdId: protocol.householdId,
        userId: protocol.userId,
        protocolItemId: w.item.id,
        itemId: w.item.itemId,
        scheduledFor: w.scheduledFor,
        doseAmount: w.item.doseAmount,
        doseUnit: w.item.doseUnit,
        method: w.item.method,
        status: 'pending',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        version: 0,
      };
      await db.doseSchedules.put(row);
      await db.outbox.add({
        mutationId: newId(),
        entity: 'doseSchedule',
        op: 'upsert',
        payload: row,
        createdAt: nowIso(),
        retryCount: 0,
        lastError: null,
        ackedAt: null,
      });
      inserted += 1;
    }
  });

  return { inserted, removed, kept, perItem };
}

async function wipePendingForProtocol(
  db: PeptideDb,
  items: readonly ProtocolItem[],
): Promise<RefreshResult> {
  if (items.length === 0) {
    return { inserted: 0, removed: 0, kept: 0, perItem: [] };
  }
  let removed = 0;
  await db.transaction('rw', db.doseSchedules, db.outbox, async () => {
    const itemIds = new Set(items.map((i) => i.id));
    const all = await db.doseSchedules.toArray();
    for (const s of all) {
      if (
        !s.deletedAt &&
        s.protocolItemId &&
        itemIds.has(s.protocolItemId) &&
        s.status === 'pending'
      ) {
        const stamped: DoseSchedule = {
          ...s,
          deletedAt: nowIso(),
          updatedAt: nowIso(),
          version: s.version + 1,
        };
        await db.doseSchedules.put(stamped);
        await db.outbox.add({
          mutationId: newId(),
          entity: 'doseSchedule',
          op: 'delete',
          payload: { id: s.id, deletedAt: stamped.deletedAt },
          createdAt: nowIso(),
          retryCount: 0,
          lastError: null,
          ackedAt: null,
        });
        removed += 1;
      }
    }
  });
  return {
    inserted: 0,
    removed,
    kept: 0,
    perItem: items.map((i) => ({ protocolItemId: i.id, occurrences: 0 })),
  };
}
