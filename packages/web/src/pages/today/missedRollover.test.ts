import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { makeTestDb, seedHousehold, type TestSeed } from '@/db/test-helpers';
import type { DoseSchedule, PeptideDb } from '@/db';
import { newId, nowIso } from '@/db';
import { rolloverMissedSchedules } from './missedRollover';

let db: PeptideDb;
let seed: TestSeed;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
  seed = await seedHousehold(db);
});

afterEach(() => {
  db.close();
});

function makeSchedule(overrides: Partial<DoseSchedule>): DoseSchedule {
  return {
    id: newId(),
    householdId: seed.household.id,
    userId: seed.alex.id,
    itemId: seed.bpc.id,
    scheduledFor: '2026-04-01T08:00:00.000Z',
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
    ...overrides,
  };
}

describe('rolloverMissedSchedules', () => {
  it('flips overdue pending schedules to missed', async () => {
    const a = makeSchedule({ scheduledFor: '2026-04-01T08:00:00.000Z' });
    const b = makeSchedule({ scheduledFor: '2026-04-02T08:00:00.000Z' });
    await db.doseSchedules.put(a);
    await db.doseSchedules.put(b);

    const flipped = await rolloverMissedSchedules(db, seed.household.id, {
      now: new Date('2026-04-05T00:00:00Z'),
    });
    expect(flipped).toBe(2);
    const rows = await db.doseSchedules.toArray();
    expect(rows.every((r) => r.status === 'missed')).toBe(true);
  });

  it('does not touch schedules within the grace window', async () => {
    const within = makeSchedule({ scheduledFor: '2026-04-04T08:00:00.000Z' });
    await db.doseSchedules.put(within);
    const flipped = await rolloverMissedSchedules(db, seed.household.id, {
      now: new Date('2026-04-04T20:00:00Z'),
    });
    expect(flipped).toBe(0);
    const row = await db.doseSchedules.get(within.id);
    expect(row?.status).toBe('pending');
  });

  it('leaves logged and skipped schedules alone', async () => {
    const logged = makeSchedule({
      scheduledFor: '2026-04-01T08:00:00.000Z',
      status: 'logged',
    });
    const skipped = makeSchedule({
      scheduledFor: '2026-04-01T08:00:00.000Z',
      status: 'skipped',
    });
    await db.doseSchedules.put(logged);
    await db.doseSchedules.put(skipped);
    const flipped = await rolloverMissedSchedules(db, seed.household.id, {
      now: new Date('2026-04-05T00:00:00Z'),
    });
    expect(flipped).toBe(0);
  });
});
