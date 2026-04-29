import { describe, expect, it } from 'vitest';
import { buildDescription, buildSummary, generateIcs } from './generate.js';

const FIXED_NOW = new Date('2026-04-29T10:00:00Z');

describe('generateIcs — RFC-5545 surface invariants', () => {
  it('emits CRLF line endings exclusively', () => {
    const ics = generateIcs({
      calendarName: 'Test',
      privacy: 'minimal',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T10:00:00Z'),
          durationMinutes: 5,
          summary: 'Reminder',
        },
      ],
      now: FIXED_NOW,
    });
    expect(ics).toContain('\r\n');
    // No bare LF without preceding CR
    const bareLfMatches = ics.split('').filter((c, i, arr) => c === '\n' && arr[i - 1] !== '\r');
    expect(bareLfMatches).toHaveLength(0);
  });

  it('opens with VCALENDAR and closes correctly', () => {
    const ics = generateIcs({
      calendarName: 'Test',
      privacy: 'minimal',
      events: [],
      now: FIXED_NOW,
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:');
    expect(ics).toContain('METHOD:PUBLISH');
  });

  it('UID stability: same inputs produce same UID even if DTSTAMP differs', () => {
    const events = [
      {
        uid: 'sched-123@peptide-tracker.app',
        dtstart: new Date('2026-04-29T10:00:00Z'),
        durationMinutes: 5,
        summary: 'A',
      },
    ];
    const a = generateIcs({
      calendarName: 'X',
      privacy: 'minimal',
      events,
      now: new Date('2026-04-29T10:00:00Z'),
    });
    const b = generateIcs({
      calendarName: 'X',
      privacy: 'minimal',
      events,
      now: new Date('2026-12-31T23:59:00Z'), // DTSTAMP differs
    });
    expect(extract(a, 'UID:')).toBe(extract(b, 'UID:'));
    expect(extract(a, 'UID:')).toBe('sched-123@peptide-tracker.app');
    expect(extract(a, 'DTSTAMP:')).not.toBe(extract(b, 'DTSTAMP:'));
  });

  it('escapes commas, semicolons, newlines, backslashes in SUMMARY/DESCRIPTION', () => {
    const ics = generateIcs({
      calendarName: 'X',
      privacy: 'full',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T10:00:00Z'),
          durationMinutes: 5,
          summary: 'A, B; C\nD\\E',
          description: 'line1\nline2',
        },
      ],
      now: FIXED_NOW,
    });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\nD\\\\E');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });

  it('folds lines longer than 75 octets with CRLF + space', () => {
    const long = 'X'.repeat(200);
    const ics = generateIcs({
      calendarName: 'X',
      privacy: 'full',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T10:00:00Z'),
          durationMinutes: 5,
          summary: long,
        },
      ],
      now: FIXED_NOW,
    });
    const summaryLines = ics
      .split('\r\n')
      .filter((l) => l.startsWith('SUMMARY') || l.startsWith(' '));
    expect(summaryLines.length).toBeGreaterThan(1);
    // Reassemble — concatenation strips the leading space on continuation lines
    const reconstructed = summaryLines.map((l, i) => (i === 0 ? l : l.slice(1))).join('');
    expect(reconstructed).toBe(`SUMMARY:${long}`);
  });

  it('emits DTSTART;TZID when tzid is provided', () => {
    const ics = generateIcs({
      calendarName: 'X',
      privacy: 'full',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T08:00:00Z'),
          durationMinutes: 5,
          summary: 'A',
          tzid: 'America/New_York',
          rrule: 'FREQ=DAILY',
        },
      ],
      now: FIXED_NOW,
    });
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260429T080000');
    expect(ics).toContain('RRULE:FREQ=DAILY');
  });

  it('emits VALARM blocks for reminderMinutesBefore', () => {
    const ics = generateIcs({
      calendarName: 'X',
      privacy: 'full',
      events: [
        {
          uid: 'a@b',
          dtstart: new Date('2026-04-29T10:00:00Z'),
          durationMinutes: 5,
          summary: 'A',
          reminderMinutesBefore: [10, 60],
        },
      ],
      now: FIXED_NOW,
    });
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics).toContain('END:VALARM');
  });

  it('empty calendar (zero events) is still a valid VCALENDAR', () => {
    const ics = generateIcs({
      calendarName: 'Empty',
      privacy: 'minimal',
      events: [],
      now: FIXED_NOW,
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('snapshot: deterministic output for fixed inputs', () => {
    const ics = generateIcs({
      calendarName: 'Sample',
      privacy: 'generic',
      events: [
        {
          uid: 'sched-a@p.app',
          dtstart: new Date('2026-04-29T08:00:00Z'),
          durationMinutes: 5,
          summary: 'Scheduled dose — Alex',
          rrule: 'FREQ=DAILY',
        },
      ],
      now: FIXED_NOW,
    });
    expect(ics).toMatchSnapshot();
  });
});

describe('buildSummary / buildDescription privacy modes', () => {
  const inputs = {
    userDisplayName: 'Alex',
    productName: 'Sample peptide A',
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    protocolName: 'Healing stack',
  };

  it('minimal: just "Reminder"', () => {
    expect(buildSummary('minimal', inputs)).toBe('Reminder');
    expect(buildDescription('minimal', inputs)).toBeUndefined();
  });

  it('generic: "Scheduled dose — <user>"', () => {
    expect(buildSummary('generic', inputs)).toBe('Scheduled dose — Alex');
    expect(buildDescription('generic', inputs)).toBeUndefined();
  });

  it('full: includes product, dose, method, user', () => {
    const s = buildSummary('full', inputs);
    expect(s).toContain('Sample peptide A');
    expect(s).toContain('250 mcg');
    expect(s).toContain('SUBQ');
    expect(s).toContain('Alex');
    const d = buildDescription('full', inputs);
    expect(d).toContain('Healing stack');
    expect(d).toContain('Tracking only — not medical advice.');
  });
});

function extract(ics: string, prefix: string): string {
  const line = ics.split('\r\n').find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`No line with prefix ${prefix} in ICS`);
  return line.slice(prefix.length);
}
