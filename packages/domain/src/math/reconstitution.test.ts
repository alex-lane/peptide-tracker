// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import { reconstitute } from './reconstitution.js';
import { MathError } from './errors.js';

describe('reconstitute', () => {
  it('worked example #1: BPC-157 5 mg + 2 mL → 2.5 mg/mL = 2,500 mcg/mL', () => {
    // 5 mg = 5,000 mcg → 5,000 / 2 = 2,500 mcg/mL = 2.5 mg/mL
    const r = reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: 2 });
    expect(r.concentrationMcgPerMl as number).toBe(2500);
    expect(r.concentrationMgPerMlDisplay).toBe(2.5);
    expect(r.formula).toBe('5 mg ÷ 2 mL = 2.5 mg/mL');
  });

  it('worked example #2: TB-500 10 mg + 5 mL → 2 mg/mL = 2,000 mcg/mL', () => {
    const r = reconstitute({ vialMass: 10, vialMassUnit: 'mg', diluentVolumeMl: 5 });
    expect(r.concentrationMgPerMlDisplay).toBe(2);
    expect(r.concentrationMcgPerMl as number).toBe(2000);
  });

  it('handles mcg vial mass directly', () => {
    const r = reconstitute({ vialMass: 5000, vialMassUnit: 'mcg', diluentVolumeMl: 2 });
    expect(r.concentrationMcgPerMl as number).toBe(2500);
  });

  it('handles g vial mass via 1,000,000× conversion', () => {
    // 0.005 g = 5 mg = 5,000 mcg → 5,000 / 2 = 2,500 mcg/mL
    const r = reconstitute({ vialMass: 0.005, vialMassUnit: 'g', diluentVolumeMl: 2 });
    expect(r.concentrationMcgPerMl as number).toBe(2500);
  });

  it('refuses zero diluent (DIVISION_BY_ZERO)', () => {
    try {
      reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: 0 });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MathError);
      expect((err as MathError).code).toBe('DIVISION_BY_ZERO');
    }
  });

  it('refuses negative diluent', () => {
    expect(() => reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: -1 })).toThrow(
      MathError,
    );
  });

  it('refuses non-finite diluent', () => {
    expect(() => reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: NaN })).toThrow(
      MathError,
    );
    expect(() =>
      reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: Infinity }),
    ).toThrow(MathError);
  });

  it('refuses zero / negative vial mass', () => {
    expect(() => reconstitute({ vialMass: 0, vialMassUnit: 'mg', diluentVolumeMl: 2 })).toThrow(
      MathError,
    );
    expect(() => reconstitute({ vialMass: -5, vialMassUnit: 'mg', diluentVolumeMl: 2 })).toThrow(
      MathError,
    );
  });

  it('defaults diluent type to bac_water and respects override', () => {
    const r1 = reconstitute({ vialMass: 5, vialMassUnit: 'mg', diluentVolumeMl: 2 });
    expect(r1.inputs.diluentType).toBe('bac_water');
    const r2 = reconstitute({
      vialMass: 5,
      vialMassUnit: 'mg',
      diluentVolumeMl: 2,
      diluentType: 'sterile_water',
    });
    expect(r2.inputs.diluentType).toBe('sterile_water');
  });
});
