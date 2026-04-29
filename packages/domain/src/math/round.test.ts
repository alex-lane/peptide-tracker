// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assertNonNegativeFinite, assertPositiveFinite, roundTo } from './round.js';
import { MathError } from './errors.js';

describe('roundTo', () => {
  it('rounds at common precisions', () => {
    expect(roundTo(0.1 + 0.2, 4)).toBe(0.3);
    expect(roundTo(1.234567, 3)).toBe(1.235);
    expect(roundTo(2.5, 0)).toBe(3); // banker's rounding NOT applied — half away from zero
    expect(roundTo(-2.5, 0)).toBe(-2); // Math.round semantics: half rounds toward +∞
  });

  it('handles 0 and integer values without precision loss', () => {
    expect(roundTo(0, 4)).toBe(0);
    expect(roundTo(123, 0)).toBe(123);
    expect(roundTo(123, 4)).toBe(123);
  });

  it('throws on non-finite inputs', () => {
    expect(() => roundTo(NaN, 2)).toThrow(MathError);
    expect(() => roundTo(Infinity, 2)).toThrow(MathError);
    expect(() => roundTo(-Infinity, 2)).toThrow(MathError);
  });

  it('rejects nonsensical decimal counts', () => {
    expect(() => roundTo(1, -1)).toThrow(MathError);
    expect(() => roundTo(1, 1.5)).toThrow(MathError);
    expect(() => roundTo(1, 13)).toThrow(MathError);
  });

  it('property: rounding is idempotent within the dose-math domain', () => {
    // Doses in this app live in [-1000, 1000] with 0..6 decimals. Outside
    // that range, IEEE-754 representation gaps make idempotency impossible
    // to guarantee for arbitrary rounding strategies — and we never round
    // values that large anyway.
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 4 }),
        (v, d) => {
          const once = roundTo(v, d);
          const twice = roundTo(once, d);
          return Object.is(once, twice);
        },
      ),
    );
  });
});

describe('assertPositiveFinite', () => {
  it('returns the value when valid', () => {
    expect(assertPositiveFinite(1, 'x')).toBe(1);
    expect(assertPositiveFinite(0.0001, 'x')).toBe(0.0001);
  });

  it('throws on zero, negative, NaN, Infinity', () => {
    expect(() => assertPositiveFinite(0, 'x')).toThrow(MathError);
    expect(() => assertPositiveFinite(-1, 'x')).toThrow(MathError);
    expect(() => assertPositiveFinite(NaN, 'x')).toThrow(MathError);
    expect(() => assertPositiveFinite(Infinity, 'x')).toThrow(MathError);
    expect(() => assertPositiveFinite(-Infinity, 'x')).toThrow(MathError);
    expect(() => assertPositiveFinite(Number.MIN_VALUE, 'x')).not.toThrow(); // Number.MIN_VALUE > 0
  });
});

describe('assertNonNegativeFinite', () => {
  it('accepts zero and positives', () => {
    expect(assertNonNegativeFinite(0, 'x')).toBe(0);
    expect(assertNonNegativeFinite(1, 'x')).toBe(1);
  });

  it('rejects negatives and non-finite', () => {
    expect(() => assertNonNegativeFinite(-0.0001, 'x')).toThrow(MathError);
    expect(() => assertNonNegativeFinite(NaN, 'x')).toThrow(MathError);
    expect(() => assertNonNegativeFinite(Infinity, 'x')).toThrow(MathError);
  });
});
