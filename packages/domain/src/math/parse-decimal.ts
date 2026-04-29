// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';

/**
 * Parse a user-supplied decimal string into a finite number, accepting
 * either '.' or ',' as the decimal separator. Locale-aware in the sense
 * that EU users typing "0,1" on iOS Safari (which only offers a comma key
 * in EU locales) will not have their math silently rejected.
 *
 * Rejects: empty/whitespace, multiple separators, leading/trailing separators,
 * scientific notation, hex/octal/binary literals, currency symbols, NaN-shaped
 * inputs.
 *
 * Use this at the boundary of every numeric form input. Internally, all math
 * operates on canonical `number` only.
 */
export function parseDecimalInput(raw: string): number {
  if (typeof raw !== 'string') {
    throw new MathError('INVALID_DECIMAL', 'parseDecimalInput requires a string', {
      type: typeof raw,
    });
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new MathError('EMPTY_INPUT', 'Decimal input is empty');
  }

  // Reject scientific notation, hex, currency, etc — only ASCII digits +
  // optional leading sign + at most one '.' or ',' separator.
  if (!/^[+-]?\d+([.,]\d+)?$/.test(trimmed)) {
    throw new MathError('INVALID_DECIMAL', `Cannot parse "${raw}" as a decimal number`, {
      raw,
    });
  }

  const normalized = trimmed.replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    // Defensive — regex above should preclude this, but keep the invariant.
    throw new MathError('NON_FINITE', `Parsed value is not finite: ${raw}`, { raw });
  }
  return value;
}

/**
 * Parse multiple decimal inputs at once with consistent error context.
 */
export function parseDecimalInputs(inputs: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(inputs)) {
    const raw = inputs[key];
    if (raw === undefined) continue;
    try {
      out[key] = parseDecimalInput(raw);
    } catch (err) {
      if (err instanceof MathError) {
        throw new MathError(err.code, `${key}: ${err.message}`, { ...err.context, field: key });
      }
      throw err;
    }
  }
  return out;
}
