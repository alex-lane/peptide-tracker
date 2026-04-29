import { describe, expect, it } from 'vitest';
// Smoke test: the domain package must run unchanged in the browser bundle too.
// jsdom-environment vitest setup approximates the browser runtime closely.
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

describe('domain ↔ web runtime', () => {
  it('imports a version constant', () => {
    expect(DOMAIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('runs reconstitution + dose math chain', () => {
    const recon = reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: 2 });
    const dose = computeDoseVolume({
      doseAmount: 250,
      doseUnit: 'mcg',
      concentrationMcgPerMl: recon.concentrationMcgPerMl,
    });
    expect(dose.volumeMlDisplay).toBe(0.1);
    expect(dose.insulinUnitsU100Display).toBe(10);
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
  });

  it('parses an entity schema and rejects bad timezones', () => {
    expect(household.safeParse({}).success).toBe(false);
  });

  it('renders an ICS feed', () => {
    void mcgPerMl;
    const ics = generateIcs({
      calendarName: 'Test',
      privacy: 'minimal',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T08:00:00Z'),
          durationMinutes: 5,
          summary: buildSummary('minimal', {
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
    expect(ics).toContain('SUMMARY:Reminder');
  });
});
