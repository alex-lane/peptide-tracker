// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import { computeCapsuleCount } from './capsule.js';
import { MathError } from './errors.js';

describe('computeCapsuleCount', () => {
  it('worked example #3: berberine 1500 mg ÷ 500 mg = 3 capsules', () => {
    const r = computeCapsuleCount({
      doseAmount: 1500,
      doseUnit: 'mg',
      perUnitStrength: 500,
      perUnitStrengthUnit: 'mg',
    });
    expect(r.count).toBe(3);
    expect(r.countCeil).toBe(3);
    expect(r.isWholeNumber).toBe(true);
    expect(r.formula).toContain('3 capsules');
  });

  it('non-whole counts are flagged and ceiled', () => {
    const r = computeCapsuleCount({
      doseAmount: 750,
      doseUnit: 'mg',
      perUnitStrength: 500,
      perUnitStrengthUnit: 'mg',
    });
    expect(r.count).toBe(1.5);
    expect(r.countCeil).toBe(2);
    expect(r.isWholeNumber).toBe(false);
  });

  it('refuses unit mismatch (mcg vs mg) with UNIT_MISMATCH', () => {
    try {
      computeCapsuleCount({
        doseAmount: 250,
        doseUnit: 'mcg',
        perUnitStrength: 500,
        perUnitStrengthUnit: 'mg',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MathError);
      expect((err as MathError).code).toBe('UNIT_MISMATCH');
    }
  });

  it('refuses zero / negative / non-finite inputs', () => {
    expect(() =>
      computeCapsuleCount({
        doseAmount: 0,
        doseUnit: 'mg',
        perUnitStrength: 500,
        perUnitStrengthUnit: 'mg',
      }),
    ).toThrow(MathError);
    expect(() =>
      computeCapsuleCount({
        doseAmount: 100,
        doseUnit: 'mg',
        perUnitStrength: -1,
        perUnitStrengthUnit: 'mg',
      }),
    ).toThrow(MathError);
    expect(() =>
      computeCapsuleCount({
        doseAmount: NaN,
        doseUnit: 'mg',
        perUnitStrength: 500,
        perUnitStrengthUnit: 'mg',
      }),
    ).toThrow(MathError);
  });

  it('honors tablet form label', () => {
    const r = computeCapsuleCount({
      doseAmount: 500,
      doseUnit: 'mg',
      perUnitStrength: 250,
      perUnitStrengthUnit: 'mg',
      form: 'tablet',
    });
    expect(r.formula).toContain('tablet');
  });
});
