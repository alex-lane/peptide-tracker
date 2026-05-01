// Simplified RRULE picker model. The schema field is just a string, so the
// builder UI offers a small set of presets plus a "Custom" escape hatch.
// We treat the picker model -> RRULE string as one-way for save: the saved
// RRULE is what's persisted; the picker tries to recognize it on load.

export type DailyOrPreset =
  | { kind: 'daily' }
  | { kind: 'mwf' }
  | { kind: 'tth' }
  | { kind: 'weekly_one'; byday: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU' }
  | { kind: 'every_n_days'; n: number }
  | { kind: 'custom'; rrule: string };

export function rrulePresetToString(preset: DailyOrPreset): string {
  switch (preset.kind) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'mwf':
      return 'FREQ=WEEKLY;BYDAY=MO,WE,FR';
    case 'tth':
      return 'FREQ=WEEKLY;BYDAY=TU,TH';
    case 'weekly_one':
      return `FREQ=WEEKLY;BYDAY=${preset.byday}`;
    case 'every_n_days':
      return `FREQ=DAILY;INTERVAL=${preset.n}`;
    case 'custom':
      return preset.rrule;
  }
}

/**
 * Best-effort recognizer. Returns the most-specific preset that matches,
 * or `custom` with the original string. Not meant to be exhaustive.
 */
export function recognizeRrule(rrule: string): DailyOrPreset {
  const normalized = rrule.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized === 'FREQ=DAILY') return { kind: 'daily' };
  if (normalized === 'FREQ=WEEKLY;BYDAY=MO,WE,FR') return { kind: 'mwf' };
  if (normalized === 'FREQ=WEEKLY;BYDAY=TU,TH') return { kind: 'tth' };
  const intervalMatch = /^FREQ=DAILY;INTERVAL=(\d+)$/.exec(normalized);
  if (intervalMatch) {
    const n = Number(intervalMatch[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 30) return { kind: 'every_n_days', n };
  }
  const oneDayMatch = /^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/.exec(normalized);
  if (oneDayMatch && oneDayMatch[1]) {
    return {
      kind: 'weekly_one',
      byday: oneDayMatch[1] as Exclude<DailyOrPreset, { kind: string; rrule?: string }>['byday'],
    };
  }
  return { kind: 'custom', rrule };
}

export function describeRrule(rrule: string): string {
  const p = recognizeRrule(rrule);
  switch (p.kind) {
    case 'daily':
      return 'Every day';
    case 'mwf':
      return 'Mon / Wed / Fri';
    case 'tth':
      return 'Tue / Thu';
    case 'weekly_one':
      return `Weekly on ${dayLabel(p.byday)}`;
    case 'every_n_days':
      return `Every ${p.n} days`;
    case 'custom':
      return `Custom (${p.rrule})`;
  }
}

function dayLabel(b: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'): string {
  return {
    MO: 'Monday',
    TU: 'Tuesday',
    WE: 'Wednesday',
    TH: 'Thursday',
    FR: 'Friday',
    SA: 'Saturday',
    SU: 'Sunday',
  }[b];
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

import { expandSchedule } from '@peptide/domain';

/**
 * Validate that an (rrule, tzid, localStartTime) triple parses cleanly. Runs a
 * tiny one-day expansion against today; we only care that it doesn't throw.
 */
export function isValidRruleForBuilder(
  rrule: string,
  tzid: string,
  localStartTime: string,
): boolean {
  if (!rrule.trim()) return false;
  if (!/^\d{2}:\d{2}$/.test(localStartTime)) return false;
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 3600_000);
  try {
    expandSchedule({
      rrule,
      tzid,
      localStartDate: start.toISOString().slice(0, 10),
      localStartTime,
      windowStart: start,
      windowEnd: end,
      maxOccurrences: 1,
    });
    return true;
  } catch {
    return false;
  }
}
