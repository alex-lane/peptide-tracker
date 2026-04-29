// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';
import { roundTo } from './round.js';
import type { MassUnit } from './units.js';

export interface ActuationInput {
  /** Target dose amount + unit. */
  readonly doseAmount: number;
  readonly doseUnit: MassUnit;
  /** Strength delivered per single actuation. Same mass unit as `doseUnit`. */
  readonly perActuationStrength: number;
  readonly perActuationStrengthUnit: MassUnit;
  /** Optional volume per actuation (mL) — used to surface total volume. */
  readonly perActuationVolumeMl?: number;
  readonly form: 'drops' | 'sprays';
}

export interface ActuationResult {
  readonly count: number;
  readonly countCeil: number;
  readonly totalVolumeMl: number | null;
  readonly formula: string;
}

/**
 * Compute how many drops/sprays cover a target dose. Mirrors capsule logic
 * but adds an optional volume-per-actuation surface.
 */
export function computeActuations(input: ActuationInput): ActuationResult {
  if (!Number.isFinite(input.doseAmount) || input.doseAmount <= 0) {
    throw new MathError('NEGATIVE_INPUT', 'Dose amount must be > 0', {
      doseAmount: input.doseAmount,
    });
  }
  if (!Number.isFinite(input.perActuationStrength) || input.perActuationStrength <= 0) {
    throw new MathError('NEGATIVE_INPUT', 'Per-actuation strength must be > 0', {
      perActuationStrength: input.perActuationStrength,
    });
  }
  if (input.doseUnit !== input.perActuationStrengthUnit) {
    throw new MathError(
      'UNIT_MISMATCH',
      `Dose unit (${input.doseUnit}) must match per-actuation strength unit (${input.perActuationStrengthUnit}). Convert one side first.`,
      {
        doseUnit: input.doseUnit,
        perActuationStrengthUnit: input.perActuationStrengthUnit,
      },
    );
  }
  if (input.perActuationVolumeMl !== undefined) {
    if (!Number.isFinite(input.perActuationVolumeMl) || input.perActuationVolumeMl <= 0) {
      throw new MathError('NEGATIVE_INPUT', 'Per-actuation volume must be > 0 mL', {
        perActuationVolumeMl: input.perActuationVolumeMl,
      });
    }
  }

  const count = input.doseAmount / input.perActuationStrength;
  const totalVolume =
    input.perActuationVolumeMl !== undefined
      ? roundTo(count * input.perActuationVolumeMl, 4)
      : null;

  const trail =
    totalVolume !== null
      ? ` × ${input.perActuationVolumeMl} mL/${input.form === 'drops' ? 'drop' : 'spray'} = ${totalVolume} mL`
      : '';

  return {
    count: roundTo(count, 4),
    countCeil: Math.ceil(roundTo(count, 6)),
    totalVolumeMl: totalVolume,
    formula: `${input.doseAmount} ${input.doseUnit} ÷ ${input.perActuationStrength} ${input.perActuationStrengthUnit}/${input.form === 'drops' ? 'drop' : 'spray'} = ${roundTo(count, 4)} ${input.form}${trail}`,
  };
}
