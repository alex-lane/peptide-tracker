// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';
import { roundTo } from './round.js';
import type { MassUnit } from './units.js';

export interface CapsuleInput {
  /** Target dose amount + unit. */
  readonly doseAmount: number;
  readonly doseUnit: MassUnit;
  /** Strength of one capsule/tablet, in the SAME mass unit as `doseUnit`. */
  readonly perUnitStrength: number;
  readonly perUnitStrengthUnit: MassUnit;
  /** Optional human label for "show your work" formatting. */
  readonly form?: 'capsule' | 'tablet';
}

export interface CapsuleResult {
  readonly count: number;
  /** Same as count rounded UP to the next integer (a half-capsule isn't typically possible). */
  readonly countCeil: number;
  /** Whole-number-only flag — false means user must split or accept rounding. */
  readonly isWholeNumber: boolean;
  readonly formula: string;
}

/**
 * Compute how many capsules/tablets cover a target dose. **Refuses unit
 * mismatch between dose and strength.** v1 does NOT auto-convert across
 * mass axes for capsules — units must match. The UI surfaces the mismatch
 * with a clear fix-up.
 */
export function computeCapsuleCount(input: CapsuleInput): CapsuleResult {
  if (!Number.isFinite(input.doseAmount) || input.doseAmount <= 0) {
    throw new MathError('NEGATIVE_INPUT', 'Dose amount must be > 0', {
      doseAmount: input.doseAmount,
    });
  }
  if (!Number.isFinite(input.perUnitStrength) || input.perUnitStrength <= 0) {
    throw new MathError('NEGATIVE_INPUT', 'Per-unit strength must be > 0', {
      perUnitStrength: input.perUnitStrength,
    });
  }
  if (input.doseUnit !== input.perUnitStrengthUnit) {
    throw new MathError(
      'UNIT_MISMATCH',
      `Dose unit (${input.doseUnit}) must match capsule strength unit (${input.perUnitStrengthUnit}). Convert one side first.`,
      { doseUnit: input.doseUnit, perUnitStrengthUnit: input.perUnitStrengthUnit },
    );
  }

  const count = input.doseAmount / input.perUnitStrength;
  const isWhole = Number.isInteger(roundTo(count, 6));
  const form = input.form ?? 'capsule';
  return {
    count: roundTo(count, 4),
    countCeil: Math.ceil(roundTo(count, 6)),
    isWholeNumber: isWhole,
    formula: `${input.doseAmount} ${input.doseUnit} ÷ ${input.perUnitStrength} ${input.perUnitStrengthUnit}/${form} = ${roundTo(count, 4)} ${form}${count === 1 ? '' : 's'}`,
  };
}
