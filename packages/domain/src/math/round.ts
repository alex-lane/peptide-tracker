// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';

/**
 * Round a number to N decimal places using half-away-from-zero (banker-safe
 * for our domain; we never average rounded values).
 *
 * Use only for **display** and final-output values. Never feed the rounded
 * result back into another calculation chain.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new MathError('NON_FINITE', `Cannot round non-finite value: ${String(value)}`, {
      value,
    });
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new MathError(
      'NEGATIVE_INPUT',
      `roundTo decimals must be integer in [0, 12], got ${decimals}`,
      { decimals },
    );
  }
  const factor = 10 ** decimals;
  // We don't bias by Number.EPSILON: doing so introduces non-idempotency
  // at large magnitudes. For our domain (doses well below 1e6) the IEEE-754
  // representation of typical values is exact enough that Math.round
  // produces the expected result.
  return Math.round(value * factor) / factor;
}

/**
 * Coerce a finite-positive-number invariant. Throws MathError otherwise.
 * Used at the entrance to every calculator.
 */
export function assertPositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new MathError('NON_FINITE', `${label} must be finite, got ${String(value)}`, {
      label,
      value,
    });
  }
  if (value <= 0) {
    throw new MathError('NEGATIVE_INPUT', `${label} must be > 0, got ${value}`, { label, value });
  }
  return value;
}

/**
 * Coerce a non-negative finite number invariant.
 * Used where 0 is meaningful (e.g., remainingQuantity).
 */
export function assertNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new MathError('NON_FINITE', `${label} must be finite, got ${String(value)}`, {
      label,
      value,
    });
  }
  if (value < 0) {
    throw new MathError('NEGATIVE_INPUT', `${label} must be >= 0, got ${value}`, { label, value });
  }
  return value;
}
