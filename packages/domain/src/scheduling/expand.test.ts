import { describe, expect, it } from 'vitest';
import { expandSchedule } from './expand.js';

describe('expandSchedule — basic', () => {
  it('FREQ=DAILY produces 7 occurrences in a 7-day window', () => {
    const out = expandSchedule({
      rrule: 'FREQ=DAILY',
      tzid: 'UTC',
      localStartDate: '2026-04-01',
      localStartTime: '08:00',
      windowStart: new Date('2026-04-01T00:00:00Z'),
      windowEnd: new Date('2026-04-08T00:00:00Z'),
    });
    expect(out.length).toBe(7);
    expect(out[0]?.instant.toISOString()).toBe('2026-04-01T08:00:00.000Z');
    expect(out[6]?.instant.toISOString()).toBe('2026-04-07T08:00:00.000Z');
  });

  it('FREQ=WEEKLY;BYDAY=MO,WE,FR fires 3 times per week', () => {
    const out = expandSchedule({
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      tzid: 'UTC',
      localStartDate: '2026-04-06', // Monday
      localStartTime: '07:00',
      windowStart: new Date('2026-04-06T00:00:00Z'),
      windowEnd: new Date('2026-04-13T00:00:00Z'),
    });
    expect(out.length).toBe(3);
    const days = out.map((o) => o.instant.toISOString().slice(0, 10));
    expect(days).toEqual(['2026-04-06', '2026-04-08', '2026-04-10']);
  });

  it('returns empty when window is inverted', () => {
    expect(
      expandSchedule({
        rrule: 'FREQ=DAILY',
        tzid: 'UTC',
        localStartDate: '2026-04-01',
        localStartTime: '08:00',
        windowStart: new Date('2026-04-08T00:00:00Z'),
        windowEnd: new Date('2026-04-01T00:00:00Z'),
      }),
    ).toEqual([]);
  });

  it('respects maxOccurrences cap', () => {
    const out = expandSchedule({
      rrule: 'FREQ=DAILY',
      tzid: 'UTC',
      localStartDate: '2026-01-01',
      localStartTime: '00:00',
      windowStart: new Date('2026-01-01T00:00:00Z'),
      windowEnd: new Date('2026-12-31T00:00:00Z'),
      maxOccurrences: 5,
    });
    expect(out.length).toBe(5);
  });
});

describe('expandSchedule — DST handling', () => {
  it('US DST forward (2026-03-08): weekly Monday schedule preserves 08:00 local', () => {
    const out = expandSchedule({
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      tzid: 'America/New_York',
      localStartDate: '2026-03-02', // Monday before DST
      localStartTime: '08:00',
      windowStart: new Date('2026-03-01T00:00:00Z'),
      windowEnd: new Date('2026-03-31T00:00:00Z'),
    });
    // March 2026 Mondays in window: 2nd, 9th, 16th, 23rd, 30th
    expect(out.length).toBe(5);
    // First Monday: 08:00 EST (UTC-5) = 13:00 UTC
    expect(out[0]?.instant.toISOString()).toBe('2026-03-02T13:00:00.000Z');
    // Second Monday: still 08:00 local; after spring-forward (EDT, UTC-4) = 12:00 UTC
    expect(out[1]?.instant.toISOString()).toBe('2026-03-09T12:00:00.000Z');
    // Local wall-clock should remain 08:00 across the DST boundary.
    for (const occ of out) {
      expect(occ.localWallTime).toMatch(/T08:00:00$/);
    }
  });

  it('US DST back (2026-11-01): wall-clock 02:00 local stays consistent', () => {
    const out = expandSchedule({
      rrule: 'FREQ=DAILY;COUNT=5',
      tzid: 'America/New_York',
      localStartDate: '2026-10-30',
      localStartTime: '02:00',
      windowStart: new Date('2026-10-30T00:00:00Z'),
      windowEnd: new Date('2026-11-05T00:00:00Z'),
    });
    expect(out.length).toBe(5);
    for (const occ of out) {
      expect(occ.localWallTime).toMatch(/T02:00:00$/);
    }
  });
});

describe('expandSchedule — cycle filter', () => {
  it('5 on / 2 off skips days 5 and 6 of each cycle', () => {
    const out = expandSchedule({
      rrule: 'FREQ=DAILY',
      tzid: 'UTC',
      localStartDate: '2026-04-01',
      localStartTime: '08:00',
      windowStart: new Date('2026-04-01T00:00:00Z'),
      windowEnd: new Date('2026-04-15T00:00:00Z'),
      cycle: { onDays: 5, offDays: 2 },
    });
    expect(out.length).toBe(10); // 14 days × 5/7 = 10 on-cycle
    const days = out.map((o) => o.instant.toISOString().slice(0, 10));
    expect(days).toEqual([
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
      '2026-04-12',
    ]);
  });

  it('cycle of all-off (offDays only) yields zero occurrences', () => {
    const out = expandSchedule({
      rrule: 'FREQ=DAILY',
      tzid: 'UTC',
      localStartDate: '2026-04-01',
      localStartTime: '08:00',
      windowStart: new Date('2026-04-01T00:00:00Z'),
      windowEnd: new Date('2026-04-08T00:00:00Z'),
      cycle: { onDays: 0, offDays: 1 },
    });
    expect(out).toEqual([]);
  });
});

describe('expandSchedule — input validation', () => {
  it('rejects unknown timezone', () => {
    expect(() =>
      expandSchedule({
        rrule: 'FREQ=DAILY',
        tzid: 'Bogus_TZ_Name',
        localStartDate: '2026-04-01',
        localStartTime: '08:00',
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-04-08T00:00:00Z'),
      }),
    ).toThrow();
  });

  it('rejects malformed start date / time', () => {
    expect(() =>
      expandSchedule({
        rrule: 'FREQ=DAILY',
        tzid: 'UTC',
        localStartDate: '04/01/2026',
        localStartTime: '08:00',
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-04-08T00:00:00Z'),
      }),
    ).toThrow();
    expect(() =>
      expandSchedule({
        rrule: 'FREQ=DAILY',
        tzid: 'UTC',
        localStartDate: '2026-04-01',
        localStartTime: '8am',
        windowStart: new Date('2026-04-01T00:00:00Z'),
        windowEnd: new Date('2026-04-08T00:00:00Z'),
      }),
    ).toThrow();
  });
});
