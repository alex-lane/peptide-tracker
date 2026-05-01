import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { makeTestDb, seedHousehold, type TestSeed } from '@/db/test-helpers';
import type { PeptideDb, Protocol, ProtocolItem } from '@/db';
import { newId, nowIso } from '@/db';
import { refreshSchedulesForProtocol } from './scheduleExpansion';

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

function makeProtocol(overrides: Partial<Protocol> = {}): Protocol {
  return {
    id: newId(),
    householdId: seed.household.id,
    userId: seed.alex.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
    name: 'Healing stack',
    active: true,
    startDate: '2026-04-01',
    ...overrides,
  };
}

function makeItem(protocolId: string, overrides: Partial<ProtocolItem> = {}): ProtocolItem {
  return {
    id: newId(),
    protocolId,
    itemId: seed.bpc.id,
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    rrule: 'FREQ=DAILY',
    timezone: 'America/New_York',
    localStartTime: '08:00',
    ...overrides,
  };
}

describe('refreshSchedulesForProtocol — basics', () => {
  it('expands FREQ=DAILY into 7 schedule rows for a 7-day window', async () => {
    const protocol = makeProtocol();
    const item = makeItem(protocol.id);
    const result = await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T12:00:00Z'),
      horizonDays: 7,
    });
    expect(result.inserted).toBe(7);
    expect(result.removed).toBe(0);
    const rows = await db.doseSchedules.toArray();
    expect(rows.length).toBe(7);
    expect(rows.every((r) => r.protocolItemId === item.id)).toBe(true);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
    expect(rows.every((r) => r.userId === seed.alex.id)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    const protocol = makeProtocol();
    const item = makeItem(protocol.id);
    await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T12:00:00Z'),
      horizonDays: 7,
    });
    const second = await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T12:00:00Z'),
      horizonDays: 7,
    });
    expect(second.inserted).toBe(0);
    expect(second.removed).toBe(0);
    expect(second.kept).toBe(7);
    const rows = (await db.doseSchedules.toArray()).filter((r) => !r.deletedAt);
    expect(rows.length).toBe(7);
  });

  it('removes pending rows that no longer match an updated RRULE', async () => {
    const protocol = makeProtocol();
    const item = makeItem(protocol.id, { rrule: 'FREQ=DAILY' });
    await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-06T12:00:00Z'), // Monday
      horizonDays: 7,
    });
    expect((await db.doseSchedules.toArray()).filter((r) => !r.deletedAt).length).toBe(7);

    // Switch to MWF — Apr 6/8/10 are kept (same instants as existing rows);
    // Apr 7/9/11/12 are removed.
    const updated: ProtocolItem = { ...item, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' };
    const result = await refreshSchedulesForProtocol(db, protocol, [updated], {
      now: new Date('2026-04-06T12:00:00Z'),
      horizonDays: 7,
    });
    expect(result.inserted).toBe(0);
    expect(result.kept).toBe(3);
    expect(result.removed).toBe(4);
    const live = (await db.doseSchedules.toArray()).filter((r) => !r.deletedAt);
    expect(live.length).toBe(3);
  });

  it('does NOT touch logged or skipped rows when refreshing', async () => {
    const protocol = makeProtocol();
    const item = makeItem(protocol.id, { rrule: 'FREQ=DAILY' });
    await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T12:00:00Z'),
      horizonDays: 7,
    });

    // Mark the first row "logged" — simulating M8 dose log behavior.
    const rows = await db.doseSchedules.toArray();
    const first = rows[0]!;
    await db.doseSchedules.put({
      ...first,
      status: 'logged',
      doseLogId: newId(),
      updatedAt: nowIso(),
      version: first.version + 1,
    });

    // Switch to a no-occurrences RRULE. The logged row must remain.
    const updated: ProtocolItem = {
      ...item,
      rrule: 'FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25', // no hits in window
    };
    const result = await refreshSchedulesForProtocol(db, protocol, [updated], {
      now: new Date('2026-04-01T12:00:00Z'),
      horizonDays: 7,
    });
    // 6 pending rows removed, the 1 logged row preserved.
    expect(result.removed).toBe(6);
    const all = await db.doseSchedules.toArray();
    const logged = all.filter((r) => r.status === 'logged');
    expect(logged.length).toBe(1);
  });
});

describe('refreshSchedulesForProtocol — DST', () => {
  it('keeps wall-clock 08:00 across the spring-forward boundary', async () => {
    const protocol = makeProtocol({ startDate: '2026-03-07' });
    const item = makeItem(protocol.id, {
      timezone: 'America/New_York',
      localStartTime: '08:00',
      rrule: 'FREQ=DAILY',
    });
    await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-03-07T00:00:00Z'),
      horizonDays: 10,
    });
    const rows = (await db.doseSchedules.toArray())
      .filter((r) => !r.deletedAt)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

    // Spring forward in 2026: Sun, March 8.
    // March 7 (EST, UTC-5): 08:00 local = 13:00 UTC
    // March 8 onward (EDT, UTC-4): 08:00 local = 12:00 UTC
    const utcHours = rows.map((r) => new Date(r.scheduledFor).getUTCHours());
    expect(utcHours[0]).toBe(13); // March 7 EST
    expect(utcHours[1]).toBe(12); // March 8 EDT
    expect(utcHours[utcHours.length - 1]).toBe(12); // last one is EDT
  });
});

describe('refreshSchedulesForProtocol — cycles', () => {
  it('honors a 5-on / 2-off cycle', async () => {
    const protocol = makeProtocol({ startDate: '2026-04-01' });
    const item = makeItem(protocol.id, {
      rrule: 'FREQ=DAILY',
      cycle: { onDays: 5, offDays: 2 },
    });
    const result = await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T00:00:00Z'),
      horizonDays: 14,
    });
    // 14 days at 5/2 cadence = 10 on-days.
    expect(result.inserted).toBe(10);
  });
});

describe('refreshSchedulesForProtocol — end of month', () => {
  it('handles BYMONTHDAY=31 by skipping months without a 31st', async () => {
    const protocol = makeProtocol({ startDate: '2026-01-31' });
    const item = makeItem(protocol.id, {
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
      timezone: 'UTC',
      localStartTime: '08:00',
    });
    const result = await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-01-31T00:00:00Z'),
      horizonDays: 121,
    });
    // Jan 31 + Mar 31 + May 31 within 121 days. (Feb / Apr have no 31st.)
    expect(result.inserted).toBe(3);
  });
});

describe('refreshSchedulesForProtocol — inactive protocol', () => {
  it('removes all pending rows when protocol becomes inactive', async () => {
    const protocol = makeProtocol();
    const item = makeItem(protocol.id);
    await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T00:00:00Z'),
      horizonDays: 7,
    });
    expect((await db.doseSchedules.toArray()).filter((r) => !r.deletedAt).length).toBe(7);

    const result = await refreshSchedulesForProtocol(
      db,
      { ...protocol, active: false },
      [item],
      { now: new Date('2026-04-01T00:00:00Z'), horizonDays: 7 },
    );
    expect(result.removed).toBe(7);
    expect((await db.doseSchedules.toArray()).filter((r) => !r.deletedAt).length).toBe(0);
  });
});

describe('refreshSchedulesForProtocol — endDate', () => {
  it('caps occurrences at protocol.endDate', async () => {
    const protocol = makeProtocol({
      startDate: '2026-04-01',
      endDate: '2026-04-05',
    });
    const item = makeItem(protocol.id, { rrule: 'FREQ=DAILY' });
    const result = await refreshSchedulesForProtocol(db, protocol, [item], {
      now: new Date('2026-04-01T00:00:00Z'),
      horizonDays: 60,
    });
    // April 1, 2, 3, 4, 5.
    expect(result.inserted).toBe(5);
  });
});
