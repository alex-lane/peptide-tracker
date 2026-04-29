import { describe, expect, it } from 'vitest';
// Smoke test: the domain package must run unchanged inside the Worker bundle.
// If anything reaches for a Node-only API or a DOM global, this import fails.
import {
  DOMAIN_VERSION,
  buildSummary,
  computeDoseVolume,
  expandSchedule,
  generateIcs,
  household,
  mcgPerMl,
  reconstitute,
} from '@peptide/domain';

describe('domain ↔ worker runtime', () => {
  it('imports a version constant', () => {
    expect(DOMAIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('runs reconstitution math', () => {
    const r = reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: 2 });
    expect(r.concentrationMgPerMlDisplay).toBe(2.5);
  });

  it('runs dose math', () => {
    const r = computeDoseVolume({
      doseAmount: 250,
      doseUnit: 'mcg',
      concentrationMcgPerMl: mcgPerMl(2500),
    });
    expect(r.volumeMlDisplay).toBe(0.1);
  });

  it('expands an RRULE in a real timezone', () => {
    const out = expandSchedule({
      rrule: 'FREQ=DAILY;COUNT=3',
      tzid: 'America/New_York',
      localStartDate: '2026-04-01',
      localStartTime: '08:00',
      windowStart: new Date('2026-04-01T00:00:00Z'),
      windowEnd: new Date('2026-04-10T00:00:00Z'),
    });
    expect(out.length).toBe(3);
    expect(out[0]?.localWallTime).toContain('T08:00:00');
  });

  it('parses an entity schema', () => {
    const r = household.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      householdId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-04-29T10:00:00Z',
      updatedAt: '2026-04-29T10:00:00Z',
      version: 0,
      name: 'Lane',
      settings: {
        defaultPrivacy: 'generic',
        units: { mass: 'mcg', volume: 'mL', insulin: 'units' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('renders an ICS feed', () => {
    const ics = generateIcs({
      calendarName: 'Test',
      privacy: 'generic',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T08:00:00Z'),
          durationMinutes: 5,
          summary: buildSummary('generic', {
            userDisplayName: 'Alex',
            productName: null,
            doseAmount: null,
            doseUnit: null,
            method: null,
            protocolName: null,
          }),
        },
      ],
      now: new Date('2026-04-29T10:00:00Z'),
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Scheduled dose — Alex');
  });
});
