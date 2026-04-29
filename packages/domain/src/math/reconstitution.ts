// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';
import { type McgPerMl, type Ml, gToMcg, mcgPerMl, mgToMcg } from './units.js';
import type { G, Mcg, Mg } from './units.js';

export type DiluentType = 'bac_water' | 'sterile_water' | 'other';

/** Result of a reconstitution computation, ready for "show your work". */
export interface ReconstitutionResult {
  readonly inputs: {
    readonly vialMassMcg: Mcg;
    readonly vialMassDisplay: string; // e.g. "5 mg"
    readonly diluentVolumeMl: Ml;
    readonly diluentType: DiluentType;
  };
  readonly concentrationMcgPerMl: McgPerMl;
  /** Same concentration expressed in mg/mL for display. */
  readonly concentrationMgPerMlDisplay: number;
  /** Formula trace, for the calculator UI. */
  readonly formula: string;
}

export interface ReconstitutionInput {
  readonly vialMass: number;
  readonly vialMassUnit: 'mcg' | 'mg' | 'g';
  readonly diluentVolumeMl: number;
  readonly diluentType?: DiluentType;
}

/**
 * Compute the resulting concentration when reconstituting a lyophilized
 * vial with diluent. Refuses zero diluent volume with a MathError.
 *
 * Worked example (PLAN §7.7 #1): 5 mg vial + 2 mL BAC water →
 * 5,000,000 mcg / 2 mL = 2,500,000 mcg/mL = 2.5 mg/mL.
 */
export function reconstitute(input: ReconstitutionInput): ReconstitutionResult {
  if (!Number.isFinite(input.vialMass) || input.vialMass <= 0) {
    throw new MathError('NEGATIVE_INPUT', 'Vial mass must be > 0', { vialMass: input.vialMass });
  }
  if (!Number.isFinite(input.diluentVolumeMl)) {
    throw new MathError('NON_FINITE', 'Diluent volume must be finite', {
      diluentVolumeMl: input.diluentVolumeMl,
    });
  }
  if (input.diluentVolumeMl <= 0) {
    throw new MathError('DIVISION_BY_ZERO', 'Diluent volume must be > 0 mL', {
      diluentVolumeMl: input.diluentVolumeMl,
    });
  }

  const vialMassMcg: Mcg = (() => {
    switch (input.vialMassUnit) {
      case 'mcg':
        return input.vialMass as Mcg;
      case 'mg':
        return mgToMcg(input.vialMass as Mg);
      case 'g':
        return gToMcg(input.vialMass as G);
    }
  })();

  const diluentVolumeMl = input.diluentVolumeMl as Ml;
  const concentration = mcgPerMl((vialMassMcg as number) / (diluentVolumeMl as number));

  const massDisplay = `${input.vialMass} ${input.vialMassUnit}`;
  const concMgPerMl = (concentration as number) / 1000;

  return {
    inputs: {
      vialMassMcg,
      vialMassDisplay: massDisplay,
      diluentVolumeMl,
      diluentType: input.diluentType ?? 'bac_water',
    },
    concentrationMcgPerMl: concentration,
    concentrationMgPerMlDisplay: concMgPerMl,
    formula: `${massDisplay} ÷ ${input.diluentVolumeMl} mL = ${concMgPerMl} mg/mL`,
  };
}
