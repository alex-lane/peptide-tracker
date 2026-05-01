// Forecast when a preferred batch will be drained by a protocol's upcoming
// schedules. Pure function — no DB. Caller pre-fetches schedules + batches.
//
// Heuristic v1:
//  - We only project for items with a `preferredBatchId` (otherwise: many
//    batches could satisfy the schedule and depletion is ambiguous).
//  - We only project for injectables — depletion math for those is a
//    straightforward dose_mcg / concentration_mcgPerMl → mL withdrawn.
//  - We canonicalize doseUnit to mcg internally; IU doses are skipped (no
//    auto IU↔mass conversion).
//  - Other forms (capsule/spray/drop) decrement by 1 unit per occurrence.
//  - Returns null if nothing depletes within the lookahead window.

import type { DoseSchedule, InventoryBatch, ProtocolItem } from '@/db';

export interface DepletionInput {
  /** Items to consider. Only items with `preferredBatchId` are projected. */
  readonly items: readonly ProtocolItem[];
  /** All batches (we look up by id). */
  readonly batches: readonly InventoryBatch[];
  /** Schedules sorted ASC by scheduledFor. */
  readonly schedules: readonly DoseSchedule[];
}

export interface DepletionForecast {
  protocolItemId: string;
  batchId: string;
  /** ISO date the batch is projected to hit zero, or null if not in window. */
  depletesOn: string | null;
  /** Doses fired against the batch within the schedule window. */
  dosesProjected: number;
  /** Reason if depletion couldn't be projected (e.g., IU dose). */
  reason?: 'unit_unsupported' | 'no_concentration' | 'unsupported_form';
}

const MASS_TO_MCG: Record<'mcg' | 'mg' | 'g', number> = {
  mcg: 1,
  mg: 1000,
  g: 1_000_000,
};

export function projectDepletion(input: DepletionInput): DepletionForecast[] {
  const out: DepletionForecast[] = [];
  const batchById = new Map(input.batches.map((b) => [b.id, b]));

  for (const item of input.items) {
    if (!item.preferredBatchId) continue;
    const batch = batchById.get(item.preferredBatchId);
    if (!batch || batch.deletedAt) continue;

    const itemSchedules = input.schedules
      .filter((s) => s.protocolItemId === item.id && s.status === 'pending')
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

    if (itemSchedules.length === 0) {
      out.push({
        protocolItemId: item.id,
        batchId: batch.id,
        depletesOn: null,
        dosesProjected: 0,
      });
      continue;
    }

    const f = projectOne(item, batch, itemSchedules);
    out.push(f);
  }
  return out;
}

function projectOne(
  item: ProtocolItem,
  batch: InventoryBatch,
  schedules: readonly DoseSchedule[],
): DepletionForecast {
  // Injectables with a reconstitution record: deplete by mL withdrawn.
  if (
    (batch.initialQuantityUnit === 'mL' || batch.initialQuantityUnit === 'mg' ||
      batch.initialQuantityUnit === 'mcg') &&
    batch.reconstitution
  ) {
    const c = batch.reconstitution.resultingConcentration;
    if (c.unit === 'IU' || item.doseUnit === 'IU') {
      return {
        protocolItemId: item.id,
        batchId: batch.id,
        depletesOn: null,
        dosesProjected: 0,
        reason: 'unit_unsupported',
      };
    }
    if (
      item.doseUnit !== 'mcg' && item.doseUnit !== 'mg' && item.doseUnit !== 'g'
    ) {
      return {
        protocolItemId: item.id,
        batchId: batch.id,
        depletesOn: null,
        dosesProjected: 0,
        reason: 'unit_unsupported',
      };
    }
    const concMcgPerMl =
      c.unit === 'mg' ? c.value * 1000 : c.unit === 'g' ? c.value * 1_000_000 : c.value;
    if (concMcgPerMl <= 0) {
      return {
        protocolItemId: item.id,
        batchId: batch.id,
        depletesOn: null,
        dosesProjected: 0,
        reason: 'no_concentration',
      };
    }
    const doseMcg = item.doseAmount * MASS_TO_MCG[item.doseUnit];
    const mlPerDose = doseMcg / concMcgPerMl;
    return walk(item, batch, schedules, mlPerDose, batch.remainingQuantity);
  }
  // Capsule / tablet / spray / drop forms: 1 unit per occurrence.
  if (
    batch.initialQuantityUnit === 'capsules' ||
    batch.initialQuantityUnit === 'tablets' ||
    batch.initialQuantityUnit === 'sprays' ||
    batch.initialQuantityUnit === 'drops'
  ) {
    return walk(item, batch, schedules, 1, batch.remainingQuantity);
  }
  return {
    protocolItemId: item.id,
    batchId: batch.id,
    depletesOn: null,
    dosesProjected: 0,
    reason: 'unsupported_form',
  };
}

function walk(
  item: ProtocolItem,
  batch: InventoryBatch,
  schedules: readonly DoseSchedule[],
  perDose: number,
  startingRemaining: number,
): DepletionForecast {
  let remaining = startingRemaining;
  let depletesOn: string | null = null;
  let count = 0;
  for (const s of schedules) {
    remaining -= perDose;
    count += 1;
    if (remaining <= 0) {
      depletesOn = s.scheduledFor.slice(0, 10);
      break;
    }
  }
  return { protocolItemId: item.id, batchId: batch.id, depletesOn, dosesProjected: count };
}
