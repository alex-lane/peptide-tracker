import { RRule, rrulestr } from 'rrule';
import { isValidTimeZone, zonedWallTimeToUtc } from './timezone.js';

export interface ExpandInput {
  /** RRULE body, e.g. `FREQ=DAILY;COUNT=7` or `FREQ=WEEKLY;BYDAY=MO,WE,FR`. */
  readonly rrule: string;
  /** IANA timezone, e.g. `America/New_York`. */
  readonly tzid: string;
  /** Local-wall-time start as `YYYY-MM-DD`. */
  readonly localStartDate: string;
  /** Local start time of day (`HH:mm`) within `tzid`. */
  readonly localStartTime: string;
  /** Window start (UTC instant). Returned occurrences are >= this. */
  readonly windowStart: Date;
  /** Window end (UTC instant). Returned occurrences are < this. */
  readonly windowEnd: Date;
  /**
   * Optional cycle filter (`{ onDays, offDays }`). Counts whole-day
   * cycles starting on `localStartDate`; off-cycle days are filtered out.
   */
  readonly cycle?: { onDays: number; offDays: number };
  /** Hard cap on number of occurrences returned. Default 1000. */
  readonly maxOccurrences?: number;
}

export interface Occurrence {
  /** Instant in UTC. */
  readonly instant: Date;
  /** Wall-clock representation in the source timezone, ISO-like (no offset). */
  readonly localWallTime: string;
}

const DEFAULT_MAX = 1000;

/**
 * Expand an (RRULE, IANA timezone, local-wall start time) triple into
 * concrete UTC instants within `[windowStart, windowEnd)`.
 *
 * Strategy: rrule operates in floating-point UTC. To preserve local wall
 * clock across DST transitions, we:
 *   1. Compute a "floating" DTSTART by treating the local wall time AS
 *      UTC (not the actual UTC instant in tzid).
 *   2. Let rrule expand → floating-UTC occurrences whose components
 *      (year/month/day/hour/min) are the local wall components we want.
 *   3. Convert each occurrence's local components → real UTC instant via
 *      zonedWallTimeToUtc(tzid, ...).
 *
 * This guarantees the resulting UTC instants always have wall-clock ==
 * the original `localStartTime` in `tzid`, even across DST boundaries.
 */
export function expandSchedule(input: ExpandInput): Occurrence[] {
  if (!isValidTimeZone(input.tzid)) {
    throw new Error(`Unknown IANA timezone: ${input.tzid}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localStartDate)) {
    throw new Error(`localStartDate must be YYYY-MM-DD, got ${input.localStartDate}`);
  }
  if (!/^\d{2}:\d{2}$/.test(input.localStartTime)) {
    throw new Error(`localStartTime must be HH:mm, got ${input.localStartTime}`);
  }
  if (input.windowEnd.getTime() <= input.windowStart.getTime()) {
    return [];
  }

  const [yearStr, monthStr, dayStr] = input.localStartDate.split('-');
  const [hourStr, minuteStr] = input.localStartTime.split(':');
  const year = Number(yearStr ?? '0');
  const month = Number(monthStr ?? '0');
  const day = Number(dayStr ?? '0');
  const hour = Number(hourStr ?? '0');
  const minute = Number(minuteStr ?? '0');

  // Floating DTSTART: pretend wall-clock IS UTC. Each rrule occurrence's
  // .getUTC*() reads the local wall components directly.
  const floatingStart = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const rule = rrulestr(`DTSTART:${rruleDate(floatingStart)}\nRRULE:${input.rrule}`, {
    forceset: false,
  }) as RRule;

  // Floating-window: shift the real UTC window into floating-UTC by adding
  // the cumulative tz offset at each end. We over-pull (±48h) and filter
  // precisely after converting back.
  const overpull = 48 * 3600_000;
  const tzOffsetAtStart =
    floatingStart.getTime() -
    zonedWallTimeToUtc(input.tzid, year, month, day, hour, minute).getTime();

  const floatingWindowStart = new Date(input.windowStart.getTime() + tzOffsetAtStart - overpull);
  const floatingWindowEnd = new Date(input.windowEnd.getTime() + tzOffsetAtStart + overpull);

  const floatingOccurrences = rule.between(floatingWindowStart, floatingWindowEnd, true);

  const max = input.maxOccurrences ?? DEFAULT_MAX;
  const results: Occurrence[] = [];

  // Cycle filter: bucket each occurrence by whole-day index since localStartDate.
  const cycleStartDayUtcMs = Date.UTC(year, month - 1, day);
  const cycleLen = input.cycle ? input.cycle.onDays + input.cycle.offDays : 0;

  for (const occ of floatingOccurrences) {
    // Read floating components (which equal the local wall components).
    const wallYear = occ.getUTCFullYear();
    const wallMonth = occ.getUTCMonth() + 1;
    const wallDay = occ.getUTCDate();
    const wallHour = occ.getUTCHours();
    const wallMinute = occ.getUTCMinutes();

    // Convert local wall → real UTC instant in tzid.
    const realInstant = zonedWallTimeToUtc(
      input.tzid,
      wallYear,
      wallMonth,
      wallDay,
      wallHour,
      wallMinute,
    );

    if (realInstant.getTime() < input.windowStart.getTime()) continue;
    if (realInstant.getTime() >= input.windowEnd.getTime()) continue;

    if (input.cycle && cycleLen > 0) {
      const occDayUtcMs = Date.UTC(wallYear, wallMonth - 1, wallDay);
      const dayIdx = Math.round((occDayUtcMs - cycleStartDayUtcMs) / (24 * 3600_000));
      const phase = ((dayIdx % cycleLen) + cycleLen) % cycleLen;
      if (phase >= input.cycle.onDays) continue; // off-cycle day
    }

    const localWall =
      `${pad4(wallYear)}-${pad2(wallMonth)}-${pad2(wallDay)}T` +
      `${pad2(wallHour)}:${pad2(wallMinute)}:${pad2(occ.getUTCSeconds())}`;
    results.push({ instant: realInstant, localWallTime: localWall });

    if (results.length >= max) break;
  }

  return results;
}

function rruleDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
function pad4(n: number): string {
  return n.toString().padStart(4, '0');
}
