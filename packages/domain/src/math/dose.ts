// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';
import { roundTo } from './round.js';
import {
  type InsulinUnit,
  type McgPerMl,
  type Ml,
  type MassUnit,
  ML_PER_INSULIN_UNIT_U100,
  massFromUnit,
  massToVolume,
  mlToInsulinUnitsU100,
} from './units.js';

/**
 * Total-capacity syringe (all U-100 calibrated). 30u = 0.3 mL max,
 * 50u = 0.5 mL max, 100u = 1 mL max. Standard BD Ultra-Fine sizes.
 */
export type SyringeCapacityUnits = 30 | 50 | 100;

export interface DoseInput {
  /** Numeric dose value in `doseUnit`. */
  readonly doseAmount: number;
  readonly doseUnit: MassUnit;
  /** Concentration of the prepared solution in mcg/mL. */
  readonly concentrationMcgPerMl: McgPerMl;
  /** Total syringe capacity in U-100 units (30 / 50 / 100). Defaults to 100. */
  readonly syringeCapacityUnits?: SyringeCapacityUnits;
}

export interface DoseResult {
  readonly doseMcg: number;
  readonly volumeMl: Ml;
  readonly volumeMlDisplay: number;
  readonly insulinUnitsU100: InsulinUnit;
  readonly insulinUnitsU100Display: number;
  readonly warnings: readonly DoseWarning[];
  readonly formula: string;
}

export interface DoseWarning {
  readonly code:
    | 'DOSE_EXCEEDS_SYRINGE_CAPACITY'
    | 'VOLUME_BELOW_PRECISION'
    | 'VOLUME_ABOVE_TYPICAL';
  readonly message: string;
}

const VOLUME_PRECISION_FLOOR_ML = 0.01; // smallest insulin-syringe gradation
const VOLUME_TYPICAL_CEILING_ML = 2.0; // arbitrary "are you sure?" threshold

/**
 * Compute the volume to draw and equivalent insulin-syringe units for a
 * given mass dose against a known reconstituted concentration.
 *
 * Worked example (PLAN §7.7 #1): 250 mcg @ 2.5 mg/mL → 0.1 mL = 10 units.
 */
export function computeDoseVolume(input: DoseInput): DoseResult {
  if (!Number.isFinite(input.doseAmount) || input.doseAmount <= 0) {
    throw new MathError('NEGATIVE_INPUT', 'Dose amount must be > 0', {
      doseAmount: input.doseAmount,
    });
  }
  const doseMcg = massFromUnit(input.doseAmount, input.doseUnit);
  const volume = massToVolume(doseMcg, input.concentrationMcgPerMl);
  const units = mlToInsulinUnitsU100(volume);

  const warnings: DoseWarning[] = [];
  const capacity: SyringeCapacityUnits = input.syringeCapacityUnits ?? 100;
  // capacity (units) × ML_PER_INSULIN_UNIT_U100 = capacity in mL.
  const capacityMl = capacity * ML_PER_INSULIN_UNIT_U100;
  if ((volume as number) > capacityMl) {
    warnings.push({
      code: 'DOSE_EXCEEDS_SYRINGE_CAPACITY',
      message: `Computed volume ${roundTo(volume as number, 3)} mL exceeds the ${capacity}u syringe (${capacityMl} mL max). Pick a larger syringe or split the dose.`,
    });
  }
  if ((volume as number) < VOLUME_PRECISION_FLOOR_ML) {
    warnings.push({
      code: 'VOLUME_BELOW_PRECISION',
      message: `Computed volume ${volume as number} mL is below typical insulin-syringe precision (${VOLUME_PRECISION_FLOOR_ML} mL). Verify concentration.`,
    });
  }
  if ((volume as number) > VOLUME_TYPICAL_CEILING_ML) {
    warnings.push({
      code: 'VOLUME_ABOVE_TYPICAL',
      message: `Computed volume ${volume as number} mL exceeds typical single-injection volume. Verify dose vs concentration.`,
    });
  }

  const concMgPerMl = (input.concentrationMcgPerMl as number) / 1000;

  return {
    doseMcg: doseMcg as number,
    volumeMl: volume,
    volumeMlDisplay: roundTo(volume as number, 4),
    insulinUnitsU100: units,
    insulinUnitsU100Display: roundTo(units as number, 1),
    warnings,
    formula: `${input.doseAmount} ${input.doseUnit} ÷ ${concMgPerMl} mg/mL = ${roundTo(volume as number, 4)} mL = ${roundTo(units as number, 1)} units (U-100, 1u = ${ML_PER_INSULIN_UNIT_U100} mL)`,
  };
}
