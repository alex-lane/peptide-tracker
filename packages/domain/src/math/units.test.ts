// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ML_PER_INSULIN_UNIT_U100,
  capsules,
  drops,
  g,
  gToMcg,
  insulinUnit,
  insulinUnitsU100ToMl,
  iu,
  mL,
  massFromUnit,
  massInUnit,
  massToVolume,
  mcg,
  mcgPerMl,
  mcgToG,
  mcgToMg,
  mg,
  mgToMcg,
  mlToInsulinUnitsU100,
  sprays,
  tablets,
  volumeToMass,
} from './units.js';
import { MathError } from './errors.js';

describe('unit constructors reject invalid inputs', () => {
  const ctors = [mcg, mg, g, iu, mL, insulinUnit, capsules, tablets, drops, sprays, mcgPerMl];
  for (const ctor of ctors) {
    it(`${ctor.name} throws on 0, negative, NaN, Infinity`, () => {
      expect(() => ctor(0)).toThrow(MathError);
      expect(() => ctor(-1)).toThrow(MathError);
      expect(() => ctor(NaN)).toThrow(MathError);
      expect(() => ctor(Infinity)).toThrow(MathError);
    });
  }
});

describe('mass conversions', () => {
  it('g → mcg multiplies by 1,000,000', () => {
    expect(gToMcg(g(1)) as number).toBe(1_000_000);
    expect(gToMcg(g(0.005)) as number).toBe(5000);
  });

  it('mg → mcg multiplies by 1,000', () => {
    expect(mgToMcg(mg(5)) as number).toBe(5000);
    expect(mgToMcg(mg(0.25)) as number).toBe(250);
  });

  it('mcg → mg / mcg → g divides correctly', () => {
    expect(mcgToMg(mcg(5000)) as number).toBe(5);
    expect(mcgToG(mcg(1_000_000)) as number).toBe(1);
  });

  it('property: round-trip mass identity (g↔mcg, mg↔mcg)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: 0.001, max: 1000 }), (v) => {
        const round = mcgToG(gToMcg(g(v)));
        return Math.abs((round as number) - v) < 1e-9;
      }),
    );

    fc.assert(
      fc.property(fc.double({ noNaN: true, min: 0.001, max: 100_000 }), (v) => {
        const round = mcgToMg(mgToMcg(mg(v)));
        return Math.abs((round as number) - v) < 1e-9;
      }),
    );
  });
});

describe('insulin syringe (U-100)', () => {
  it('exposes the documented constant 1u = 0.01 mL', () => {
    expect(ML_PER_INSULIN_UNIT_U100).toBe(0.01);
  });

  it('mL → units (U-100): 0.1 mL = 10 units', () => {
    expect(mlToInsulinUnitsU100(mL(0.1)) as number).toBe(10);
    expect(mlToInsulinUnitsU100(mL(1)) as number).toBe(100);
  });

  it('units → mL (U-100): inverse', () => {
    expect(insulinUnitsU100ToMl(insulinUnit(10)) as number).toBe(0.1);
    expect(insulinUnitsU100ToMl(insulinUnit(100)) as number).toBe(1);
  });

  it('property: mL ↔ units round-trip (within float tolerance)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: 0.005, max: 5 }), (v) => {
        const round = insulinUnitsU100ToMl(mlToInsulinUnitsU100(mL(v)));
        return Math.abs((round as number) - v) < 1e-9;
      }),
    );
  });
});

describe('massToVolume / volumeToMass', () => {
  it('250 mcg @ 2,500,000 mcg/mL = 0.0001 L (0.0001 mL)', () => {
    // BPC-157 5 mg vial in 2 mL BAC water → 2,500,000 mcg/mL
    const conc = mcgPerMl(2_500_000);
    expect(massToVolume(mcg(250), conc) as number).toBeCloseTo(0.0001, 10);
  });

  it('refuses zero or negative concentration', () => {
    expect(() => massToVolume(mcg(100), 0 as never)).toThrow(MathError);
    expect(() => massToVolume(mcg(100), -1 as never)).toThrow(MathError);
  });

  it('volume → mass is the algebraic inverse', () => {
    const conc = mcgPerMl(1000);
    const vol = massToVolume(mcg(500), conc);
    expect(volumeToMass(vol, conc) as number).toBeCloseTo(500, 10);
  });
});

describe('massInUnit / massFromUnit', () => {
  it('round-trips through every supported unit', () => {
    for (const unit of ['mcg', 'mg', 'g'] as const) {
      const original = massFromUnit(2.5, unit);
      const surfaceValue = massInUnit(original, unit);
      expect(surfaceValue).toBeCloseTo(2.5, 9);
    }
  });

  it('property: massFromUnit/massInUnit identity for any positive amount', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, min: 0.001, max: 1000 }),
        fc.constantFrom('mcg', 'mg', 'g' as const),
        (amount, unit) => {
          const back = massInUnit(massFromUnit(amount, unit), unit);
          return Math.abs(back - amount) < 1e-6;
        },
      ),
    );
  });
});
