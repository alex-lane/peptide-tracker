// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import { computeDoseVolume } from './dose.js';
import { mcgPerMl } from './units.js';
import { MathError } from './errors.js';

describe('computeDoseVolume', () => {
  it('worked example #1: 250 mcg @ 2.5 mg/mL (2,500 mcg/mL) → 0.1 mL = 10 units (U-100)', () => {
    const r = computeDoseVolume({
      doseAmount: 250,
      doseUnit: 'mcg',
      concentrationMcgPerMl: mcgPerMl(2500),
    });
    expect(r.volumeMlDisplay).toBe(0.1);
    expect(r.insulinUnitsU100Display).toBe(10);
    expect(r.warnings).toHaveLength(0);
  });

  it('worked example #2: 2 mg @ 2 mg/mL (2,000 mcg/mL) → 1 mL = 100 units', () => {
    const r = computeDoseVolume({
      doseAmount: 2,
      doseUnit: 'mg',
      concentrationMcgPerMl: mcgPerMl(2000),
    });
    expect(r.volumeMlDisplay).toBe(1);
    expect(r.insulinUnitsU100Display).toBe(100);
  });

  it('formula trace is human-readable', () => {
    const r = computeDoseVolume({
      doseAmount: 250,
      doseUnit: 'mcg',
      concentrationMcgPerMl: mcgPerMl(2500),
    });
    expect(r.formula).toContain('250 mcg');
    expect(r.formula).toContain('2.5 mg/mL');
    expect(r.formula).toContain('0.1 mL');
    expect(r.formula).toContain('10 units');
  });

  it('warns on non-U100 syringe scale', () => {
    const r = computeDoseVolume({
      doseAmount: 250,
      doseUnit: 'mcg',
      concentrationMcgPerMl: mcgPerMl(2500),
      syringeScale: 'U-40',
    });
    expect(r.warnings.some((w) => w.code === 'NON_U100_SYRINGE')).toBe(true);
  });

  it('warns when volume is below insulin-syringe precision', () => {
    // 10 mcg @ 2,500 mcg/mL = 0.004 mL — below 0.01 mL floor
    const r = computeDoseVolume({
      doseAmount: 10,
      doseUnit: 'mcg',
      concentrationMcgPerMl: mcgPerMl(2500),
    });
    expect(r.warnings.some((w) => w.code === 'VOLUME_BELOW_PRECISION')).toBe(true);
  });

  it('warns when volume exceeds typical single-injection ceiling', () => {
    // 10 mg @ 2 mg/mL = 5 mL — above 2 mL ceiling
    const r = computeDoseVolume({
      doseAmount: 10,
      doseUnit: 'mg',
      concentrationMcgPerMl: mcgPerMl(2000),
    });
    expect(r.warnings.some((w) => w.code === 'VOLUME_ABOVE_TYPICAL')).toBe(true);
  });

  it('refuses zero / negative / non-finite dose', () => {
    expect(() =>
      computeDoseVolume({
        doseAmount: 0,
        doseUnit: 'mcg',
        concentrationMcgPerMl: mcgPerMl(1000),
      }),
    ).toThrow(MathError);
    expect(() =>
      computeDoseVolume({
        doseAmount: -1,
        doseUnit: 'mcg',
        concentrationMcgPerMl: mcgPerMl(1000),
      }),
    ).toThrow(MathError);
    expect(() =>
      computeDoseVolume({
        doseAmount: NaN,
        doseUnit: 'mcg',
        concentrationMcgPerMl: mcgPerMl(1000),
      }),
    ).toThrow(MathError);
  });

  it('refuses zero concentration through massToVolume', () => {
    expect(() =>
      computeDoseVolume({
        doseAmount: 250,
        doseUnit: 'mcg',
        concentrationMcgPerMl: 0 as never,
      }),
    ).toThrow(MathError);
  });
});
