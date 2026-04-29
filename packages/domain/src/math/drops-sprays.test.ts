// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import { computeActuations } from './drops-sprays.js';
import { MathError } from './errors.js';

describe('computeActuations', () => {
  it('drops: 5 mg ÷ 0.5 mg/drop = 10 drops', () => {
    const r = computeActuations({
      doseAmount: 5,
      doseUnit: 'mg',
      perActuationStrength: 0.5,
      perActuationStrengthUnit: 'mg',
      form: 'drops',
    });
    expect(r.count).toBe(10);
    expect(r.totalVolumeMl).toBeNull();
  });

  it('sprays: 200 mcg ÷ 50 mcg/spray = 4 sprays with 0.1 mL/spray = 0.4 mL', () => {
    const r = computeActuations({
      doseAmount: 200,
      doseUnit: 'mcg',
      perActuationStrength: 50,
      perActuationStrengthUnit: 'mcg',
      perActuationVolumeMl: 0.1,
      form: 'sprays',
    });
    expect(r.count).toBe(4);
    expect(r.totalVolumeMl).toBe(0.4);
    expect(r.formula).toContain('0.4 mL');
  });

  it('non-whole counts are flagged via countCeil', () => {
    const r = computeActuations({
      doseAmount: 7,
      doseUnit: 'mg',
      perActuationStrength: 2,
      perActuationStrengthUnit: 'mg',
      form: 'drops',
    });
    expect(r.count).toBe(3.5);
    expect(r.countCeil).toBe(4);
  });

  it('refuses unit mismatch', () => {
    expect(() =>
      computeActuations({
        doseAmount: 200,
        doseUnit: 'mcg',
        perActuationStrength: 0.5,
        perActuationStrengthUnit: 'mg',
        form: 'sprays',
      }),
    ).toThrow(MathError);
  });

  it('refuses zero / negative / non-finite inputs', () => {
    expect(() =>
      computeActuations({
        doseAmount: 0,
        doseUnit: 'mg',
        perActuationStrength: 0.5,
        perActuationStrengthUnit: 'mg',
        form: 'drops',
      }),
    ).toThrow(MathError);
    expect(() =>
      computeActuations({
        doseAmount: 5,
        doseUnit: 'mg',
        perActuationStrength: -1,
        perActuationStrengthUnit: 'mg',
        form: 'drops',
      }),
    ).toThrow(MathError);
    expect(() =>
      computeActuations({
        doseAmount: 5,
        doseUnit: 'mg',
        perActuationStrength: 0.5,
        perActuationStrengthUnit: 'mg',
        perActuationVolumeMl: 0,
        form: 'drops',
      }),
    ).toThrow(MathError);
  });
});
