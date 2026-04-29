import { describe, expect, it } from 'vitest';
import { isValidTimeZone, zonedWallTimeToUtc } from './timezone.js';

describe('isValidTimeZone', () => {
  it('accepts canonical IANA names', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidTimeZone('Bogus_TZ_Name_That_Does_Not_Exist')).toBe(false);
    expect(isValidTimeZone('America/NotARealCity')).toBe(false);
  });
});

describe('zonedWallTimeToUtc', () => {
  it('UTC: wall-clock equals UTC', () => {
    const d = zonedWallTimeToUtc('UTC', 2026, 4, 29, 10, 0);
    expect(d.toISOString()).toBe('2026-04-29T10:00:00.000Z');
  });

  it('America/New_York summer (EDT, UTC-4): 08:00 local = 12:00 UTC', () => {
    const d = zonedWallTimeToUtc('America/New_York', 2026, 7, 15, 8, 0);
    expect(d.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('America/New_York winter (EST, UTC-5): 08:00 local = 13:00 UTC', () => {
    const d = zonedWallTimeToUtc('America/New_York', 2026, 1, 15, 8, 0);
    expect(d.toISOString()).toBe('2026-01-15T13:00:00.000Z');
  });

  it('Asia/Tokyo (no DST, UTC+9): 08:00 local = 23:00 UTC previous day', () => {
    const d = zonedWallTimeToUtc('Asia/Tokyo', 2026, 4, 29, 8, 0);
    expect(d.toISOString()).toBe('2026-04-28T23:00:00.000Z');
  });

  it('DST forward (US 2026-03-08): 02:30 NY does not exist; resolves to 03:00 EDT', () => {
    const d = zonedWallTimeToUtc('America/New_York', 2026, 3, 8, 2, 30);
    // 02:30 NY skipped → wall clock advances to 03:00 EDT = 07:00 UTC
    expect(d.toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it('DST back (US 2026-11-01): 01:30 NY occurs twice; resolves to first (EDT) instant', () => {
    const d = zonedWallTimeToUtc('America/New_York', 2026, 11, 1, 1, 30);
    // 01:30 EDT = 05:30 UTC (the earlier of the two)
    expect(d.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });
});
