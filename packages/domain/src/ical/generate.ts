import type { CalendarPrivacyT } from '../schemas/index.js';

const PRODID = '-//peptide-tracker//domain v0.1//EN';
const CRLF = '\r\n';
/** RFC-5545 §3.1: lines MUST NOT be longer than 75 octets, fold with CRLF + space. */
const MAX_OCTETS_PER_LINE = 75;

export interface IcsEvent {
  /** Stable UID per recurring schedule. NEVER include DTSTAMP in UID input. */
  readonly uid: string;
  /** UTC instant of the first occurrence (DTSTART). */
  readonly dtstart: Date;
  /** Duration in minutes. */
  readonly durationMinutes: number;
  /** Recurrence rule body, e.g. `FREQ=DAILY` (without the `RRULE:` prefix). */
  readonly rrule?: string;
  /** Optional IANA timezone identifier for the DTSTART. If absent, DTSTART is in UTC. */
  readonly tzid?: string;
  /** SUMMARY (event title). Already redacted per privacy mode. */
  readonly summary: string;
  /** Optional DESCRIPTION (long text). Already redacted per privacy mode. */
  readonly description?: string;
  /** Reminder offsets in minutes before DTSTART (e.g., [10, 60]). */
  readonly reminderMinutesBefore?: readonly number[];
}

export interface IcsCalendarOptions {
  readonly calendarName: string;
  readonly privacy: CalendarPrivacyT;
  readonly events: readonly IcsEvent[];
  /** Optional now-instant override for deterministic snapshot tests. */
  readonly now?: Date;
}

/**
 * Generate an RFC-5545 compliant `.ics` payload. Pure string construction —
 * no Node, no Buffer, no DOM. Runs in browser AND Cloudflare Worker
 * verbatim.
 */
export function generateIcs(opts: IcsCalendarOptions): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push(`PRODID:${escapeText(PRODID)}`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);
  lines.push(`X-PEPTIDE-PRIVACY:${opts.privacy}`);

  const dtstamp = formatUtc(opts.now ?? new Date());

  for (const ev of opts.events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeText(ev.uid)}`);
    // DTSTAMP is the time at which the iCalendar object was *created*. It
    // intentionally varies between exports — exclude it from UID generation
    // so re-imports dedupe correctly.
    lines.push(`DTSTAMP:${dtstamp}`);

    if (ev.tzid) {
      lines.push(`DTSTART;TZID=${ev.tzid}:${formatLocal(ev.dtstart)}`);
    } else {
      lines.push(`DTSTART:${formatUtc(ev.dtstart)}`);
    }

    lines.push(`DURATION:PT${Math.max(1, Math.floor(ev.durationMinutes))}M`);

    if (ev.rrule && ev.rrule.length > 0) {
      lines.push(`RRULE:${ev.rrule}`);
    }

    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    }
    lines.push('TRANSP:OPAQUE');

    if (ev.reminderMinutesBefore) {
      for (const mins of ev.reminderMinutesBefore) {
        if (!Number.isFinite(mins) || mins < 0) continue;
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:${escapeText(ev.summary)}`);
        lines.push(`TRIGGER:-PT${Math.floor(mins)}M`);
        lines.push('END:VALARM');
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join(CRLF) + CRLF;
}

// ─── Privacy-mode summary builders ────────────────────────────────────

export interface SummaryInputs {
  readonly userDisplayName: string;
  readonly productName: string | null;
  readonly doseAmount: number | null;
  readonly doseUnit: string | null;
  readonly method: string | null;
  readonly protocolName: string | null;
}

export function buildSummary(privacy: CalendarPrivacyT, inputs: SummaryInputs): string {
  switch (privacy) {
    case 'minimal':
      return 'Reminder';
    case 'generic':
      return `Scheduled dose — ${inputs.userDisplayName}`;
    case 'full': {
      const dose =
        inputs.doseAmount !== null && inputs.doseUnit
          ? `${inputs.doseAmount} ${inputs.doseUnit}`
          : '';
      const method = inputs.method ? ` ${inputs.method.toUpperCase()}` : '';
      const product = inputs.productName ?? 'Dose';
      const trail = ` — ${inputs.userDisplayName}`;
      const middle = [dose, method].filter(Boolean).join('').trim();
      return `${product}${middle ? ` ${middle}` : ''}${trail}`.trim();
    }
  }
}

export function buildDescription(
  privacy: CalendarPrivacyT,
  inputs: SummaryInputs,
): string | undefined {
  if (privacy !== 'full') return undefined;
  const parts: string[] = [];
  if (inputs.protocolName) parts.push(`Protocol: ${inputs.protocolName}`);
  parts.push('Tracking only — not medical advice.');
  return parts.join('\n');
}

// ─── RFC-5545 plumbing ────────────────────────────────────────────────

/** Escape SUMMARY/DESCRIPTION/UID per RFC-5545 §3.3.11. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Fold any line whose UTF-8 byte length exceeds 75 octets per RFC-5545 §3.1.
 * Continuation lines start with a single space.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= MAX_OCTETS_PER_LINE) return line;

  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let cursor = 0;
  let firstChunk = true;

  while (cursor < bytes.length) {
    const limit = firstChunk ? MAX_OCTETS_PER_LINE : MAX_OCTETS_PER_LINE - 1;
    let end = Math.min(cursor + limit, bytes.length);
    // Don't split a multi-byte UTF-8 codepoint: walk back to a leading byte.
    while (end < bytes.length && (bytes[end]! & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
    }
    chunks.push(decoder.decode(bytes.subarray(cursor, end)));
    cursor = end;
    firstChunk = false;
  }

  return chunks.map((c, i) => (i === 0 ? c : ` ${c}`)).join(CRLF);
}

function formatUtc(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function formatLocal(d: Date): string {
  // Floating local form (no Z, no offset) — used when DTSTART has a TZID param.
  // The Date object MUST already represent the local wall time as a "naive"
  // instant; we strip the trailing offset.
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}
