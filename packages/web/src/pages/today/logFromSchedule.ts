// Pure helper that builds a (DoseLog, InventoryAdjustment) pair from a
// pending DoseSchedule + selected InventoryBatch. Domain rules:
//
//   - Injectable batch with reconstitution: deduct mL withdrawn (computed from
//     dose mass / concentration). IU doses are refused.
//   - Capsule / tablet / spray / drop batch: deduct 1 unit per dose.
//   - mL / mass-form batch with no reconstitution: deduct doseAmount mass at
//     matching unit when units align; otherwise refuse.
//
// Returns `null` adjustment when no inventory deduction can be computed —
// the dose log still saves, just without the ledger entry.

import type {
  DoseLog,
  DoseSchedule,
  InventoryBatch,
  InventoryItem,
  ProtocolItem,
  UserProfile,
} from '@/db';
import { newId, nowIso } from '@/db';

const MASS_TO_MCG: Record<'mcg' | 'mg' | 'g', number> = {
  mcg: 1,
  mg: 1000,
  g: 1_000_000,
};

export interface BuildLogArgs {
  user: UserProfile;
  schedule: DoseSchedule;
  protocolItem?: ProtocolItem | undefined;
  inventoryItem: InventoryItem;
  batch?: InventoryBatch | undefined;
  takenAtIso?: string | undefined;
  notesMd?: string | undefined;
  /** When provided, override the schedule's amount/unit. Defaults to schedule values. */
  doseAmount?: number | undefined;
  doseUnit?: DoseSchedule['doseUnit'] | undefined;
  injectionSite?: DoseLog['injectionSite'] | undefined;
}

export interface BuildLogResult {
  log: DoseLog;
  adjustment?:
    | {
        batchId: string;
        delta: number;
        unit:
          | 'mg'
          | 'mcg'
          | 'mL'
          | 'capsules'
          | 'tablets'
          | 'sprays'
          | 'drops'
          | 'g';
        reason: 'dose_log';
      }
    | undefined;
  /** Reason a deduction couldn't be computed; surfaced for the user. */
  warning?: string | undefined;
}

export function buildLogFromSchedule(args: BuildLogArgs): BuildLogResult {
  const doseAmount = args.doseAmount ?? args.schedule.doseAmount;
  const doseUnit = args.doseUnit ?? args.schedule.doseUnit;
  const log: DoseLog = {
    id: newId(),
    householdId: args.user.householdId,
    userId: args.user.id,
    itemId: args.schedule.itemId,
    ...(args.batch ? { batchId: args.batch.id } : {}),
    doseAmount,
    doseUnit,
    method: args.schedule.method,
    ...(args.injectionSite ? { injectionSite: args.injectionSite } : {}),
    takenAt: args.takenAtIso ?? nowIso(),
    ...(args.notesMd?.trim() ? { notesMd: args.notesMd.trim() } : {}),
    scheduleId: args.schedule.id,
    ...(args.protocolItem ? { protocolId: args.protocolItem.protocolId } : {}),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
  };

  const adjustment = args.batch ? computeAdjustment(args.batch, doseAmount, doseUnit) : null;
  if (!args.batch) {
    return { log, warning: 'No batch selected — inventory not deducted.' };
  }
  if (!adjustment) {
    return {
      log,
      warning: 'Dose unit not compatible with batch — inventory not deducted.',
    };
  }
  return { log, adjustment };
}

export function computeAdjustment(
  batch: InventoryBatch,
  doseAmount: number,
  doseUnit: DoseSchedule['doseUnit'],
): BuildLogResult['adjustment'] | null {
  // Injectable with reconstitution: deduct mL.
  if (batch.reconstitution) {
    const c = batch.reconstitution.resultingConcentration;
    if (c.unit === 'IU' || doseUnit === 'IU') return null;
    if (doseUnit !== 'mcg' && doseUnit !== 'mg' && doseUnit !== 'g') return null;
    const concMcgPerMl =
      c.unit === 'mg' ? c.value * 1000 : c.unit === 'g' ? c.value * 1_000_000 : c.value;
    if (concMcgPerMl <= 0) return null;
    const doseMcg = doseAmount * MASS_TO_MCG[doseUnit];
    const ml = doseMcg / concMcgPerMl;
    return { batchId: batch.id, delta: -ml, unit: 'mL', reason: 'dose_log' };
  }

  // Capsule / tablet / spray / drop: 1 per dose.
  if (
    batch.initialQuantityUnit === 'capsules' ||
    batch.initialQuantityUnit === 'tablets' ||
    batch.initialQuantityUnit === 'sprays' ||
    batch.initialQuantityUnit === 'drops'
  ) {
    return {
      batchId: batch.id,
      delta: -1,
      unit: batch.initialQuantityUnit,
      reason: 'dose_log',
    };
  }

  // Same-unit mass deduction (e.g., powder oral logged as mg out of an mg batch).
  if (
    (batch.initialQuantityUnit === 'mg' ||
      batch.initialQuantityUnit === 'mcg' ||
      batch.initialQuantityUnit === 'g') &&
    (doseUnit === 'mg' || doseUnit === 'mcg' || doseUnit === 'g')
  ) {
    const batchMcg = batch.initialQuantityUnit === 'mg' ? 1000 : batch.initialQuantityUnit === 'g' ? 1_000_000 : 1;
    const doseMcgValue = doseAmount * MASS_TO_MCG[doseUnit];
    const deltaInBatchUnit = -doseMcgValue / batchMcg;
    return {
      batchId: batch.id,
      delta: deltaInBatchUnit,
      unit: batch.initialQuantityUnit,
      reason: 'dose_log',
    };
  }

  return null;
}
