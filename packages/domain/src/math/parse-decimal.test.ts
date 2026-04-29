// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseDecimalInput, parseDecimalInputs } from './parse-decimal.js';
import { MathError } from './errors.js';

describe('parseDecimalInput', () => {
  it('parses period-separated decimals', () => {
    expect(parseDecimalInput('0.1')).toBe(0.1);
    expect(parseDecimalInput('250')).toBe(250);
    expect(parseDecimalInput('5.000')).toBe(5);
    expect(parseDecimalInput('-1.5')).toBe(-1.5);
    expect(parseDecimalInput('+2.5')).toBe(2.5);
  });

  it('parses comma-separated decimals (iOS Safari EU locale)', () => {
    expect(parseDecimalInput('0,1')).toBe(0.1);
    expect(parseDecimalInput('1,5')).toBe(1.5);
    expect(parseDecimalInput('-2,75')).toBe(-2.75);
  });

  it('trims whitespace', () => {
    expect(parseDecimalInput('  3.14  ')).toBe(3.14);
    expect(parseDecimalInput('\t1,5\n')).toBe(1.5);
  });

  it('rejects empty / whitespace-only input', () => {
    expect(() => parseDecimalInput('')).toThrow(MathError);
    expect(() => parseDecimalInput('   ')).toThrow(MathError);
  });

  it('rejects scientific notation, hex, currency, percent', () => {
    expect(() => parseDecimalInput('1e3')).toThrow(MathError);
    expect(() => parseDecimalInput('0x10')).toThrow(MathError);
    expect(() => parseDecimalInput('$100')).toThrow(MathError);
    expect(() => parseDecimalInput('5%')).toThrow(MathError);
    expect(() => parseDecimalInput('NaN')).toThrow(MathError);
    expect(() => parseDecimalInput('Infinity')).toThrow(MathError);
  });

  it('rejects multiple separators and ambiguous inputs', () => {
    expect(() => parseDecimalInput('1.2.3')).toThrow(MathError);
    expect(() => parseDecimalInput('1,2,3')).toThrow(MathError);
    expect(() => parseDecimalInput('1.2,3')).toThrow(MathError);
    expect(() => parseDecimalInput('.5')).toThrow(MathError); // require leading digit
    expect(() => parseDecimalInput('5.')).toThrow(MathError); // require trailing digit
    expect(() => parseDecimalInput(',5')).toThrow(MathError);
  });

  it('rejects non-string inputs at runtime', () => {
    // @ts-expect-error — testing runtime guard
    expect(() => parseDecimalInput(5)).toThrow(MathError);
    // @ts-expect-error — testing runtime guard
    expect(() => parseDecimalInput(null)).toThrow(MathError);
    // @ts-expect-error — testing runtime guard
    expect(() => parseDecimalInput(undefined)).toThrow(MathError);
  });

  it('property: period and comma forms parse to the same number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999_999 }),
        fc.integer({ min: 0, max: 999_999 }),
        (whole, frac) => {
          const period = `${whole}.${frac}`;
          const comma = `${whole},${frac}`;
          return parseDecimalInput(period) === parseDecimalInput(comma);
        },
      ),
    );
  });
});

describe('parseDecimalInputs', () => {
  it('parses a record of fields and reports the failing field', () => {
    expect(parseDecimalInputs({ a: '1.5', b: '2,5' })).toEqual({ a: 1.5, b: 2.5 });
  });

  it('attaches the field name on error', () => {
    try {
      parseDecimalInputs({ vialMass: '5', diluentMl: 'NaN' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MathError);
      const ctx = (err as MathError).context;
      expect(ctx['field']).toBe('diluentMl');
    }
  });

  it('skips undefined fields gracefully', () => {
    const out = parseDecimalInputs({ a: '1', b: undefined as unknown as string });
    expect(out).toEqual({ a: 1 });
  });
});
