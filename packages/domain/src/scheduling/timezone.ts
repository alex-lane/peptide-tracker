// Timezone utilities for schedule expansion. We intentionally avoid pulling in
// the full IANA tzdata at runtime; the host environment (browsers + Workers)
// provides Intl.DateTimeFormat with timezone resolution.

/**
 * Compute the UTC instant whose wall-clock representation in `tzid` matches
 * (year, month, day, hour, minute). All inputs are 1-based for month/day to
 * match the Date constructor's everyday semantics for callers, but we
 * normalise internally.
 *
 * Algorithm: brute-force iterate ±48h around the naive UTC guess, asking
 * `Intl.DateTimeFormat` for the wall-clock in `tzid`. This handles DST
 * forward/back, historical TZ changes, and any rule the host knows about.
 *
 * For "DST forward" boundaries (the wall-clock skips), we return the
 * earliest UTC instant whose wall-clock is >= the requested instant.
 *
 * For "DST back" boundaries (the wall-clock occurs twice), we return the
 * earlier (pre-transition) instant.
 */
export function zonedWallTimeToUtc(
  tzid: string,
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): Date {
  // Naive UTC guess: pretend the wall-clock IS UTC, then correct.
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // We search for the offset such that
  //   wallTimeIn(tzid, naiveUtcMs - offset) == requested wall time.
  //
  // candidate_utc = naiveUtcMs - stepMin * 60_000
  // → larger stepMin = earlier UTC instant (further behind naive).
  // To find the EARLIEST matching UTC, iterate stepMin from +14h down to -14h.
  const target = `${pad4(year)}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}`;

  for (let stepMin = 14 * 60; stepMin >= -14 * 60; stepMin -= 30) {
    const candidate = naiveUtcMs - stepMin * 60_000;
    if (formatWallTime(tzid, candidate) === target) {
      return new Date(candidate);
    }
  }

  // DST-forward gap: the requested wall-time does not exist in tzid.
  // Return the earliest UTC instant whose wall-clock is strictly after the
  // request. Same iteration direction (earliest UTC first).
  for (let stepMin = 14 * 60; stepMin >= -14 * 60; stepMin--) {
    const candidate = naiveUtcMs - stepMin * 60_000;
    if (formatWallTime(tzid, candidate) >= target) {
      return new Date(candidate);
    }
  }

  // Should be unreachable for any real IANA tzid.
  throw new Error(`Could not resolve ${target} in ${tzid}`);
}

let cachedFormatter: { tzid: string; fmt: Intl.DateTimeFormat } | null = null;

function formatterFor(tzid: string): Intl.DateTimeFormat {
  if (cachedFormatter && cachedFormatter.tzid === tzid) return cachedFormatter.fmt;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  cachedFormatter = { tzid, fmt };
  return fmt;
}

function formatWallTime(tzid: string, utcMs: number): string {
  const parts = formatterFor(tzid).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPart['type']) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  if (hour === '24') hour = '00'; // Intl quirk: midnight sometimes formats as 24
  const minute = get('minute');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
function pad4(n: number): string {
  return n.toString().padStart(4, '0');
}

/** Validate an IANA tzid by attempting to resolve a known instant in it. */
export function isValidTimeZone(tzid: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}
