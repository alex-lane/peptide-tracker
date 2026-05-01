// Auto-flip pending DoseSchedules whose scheduledFor is more than `gracePeriodMs`
// in the past to status='missed'. Runs in a single Dexie tx + outbox per row.
//
// We flip in batches keyed by householdId so the scan stays cheap.

import type { DoseSchedule, PeptideDb } from '@/db';
import { newId, nowIso } from '@/db';

const DEFAULT_GRACE_MS = 24 * 3600_000;

export async function rolloverMissedSchedules(
  db: PeptideDb,
  householdId: string,
  args: { now?: Date; gracePeriodMs?: number } = {},
): Promise<number> {
  const now = args.now ?? new Date();
  const grace = args.gracePeriodMs ?? DEFAULT_GRACE_MS;
  const cutoff = new Date(now.getTime() - grace).toISOString();

  let flipped = 0;
  await db.transaction('rw', db.doseSchedules, db.outbox, async () => {
    const rows = await db.doseSchedules.where('householdId').equals(householdId).toArray();
    for (const s of rows) {
      if (s.deletedAt) continue;
      if (s.status !== 'pending') continue;
      if (s.scheduledFor >= cutoff) continue;
      const next: DoseSchedule = {
        ...s,
        status: 'missed',
        updatedAt: nowIso(),
        version: s.version + 1,
      };
      await db.doseSchedules.put(next);
      await db.outbox.add({
        mutationId: newId(),
        entity: 'doseSchedule',
        op: 'upsert',
        payload: next,
        createdAt: nowIso(),
        retryCount: 0,
        lastError: null,
        ackedAt: null,
      });
      flipped += 1;
    }
  });
  return flipped;
}
