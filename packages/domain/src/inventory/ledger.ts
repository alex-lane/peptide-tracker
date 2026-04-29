import { MathError } from '../math/errors.js';
import { assertNonNegativeFinite } from '../math/round.js';
import type { BatchQuantityUnitT } from '../schemas/index.js';

export interface LedgerAdjustment {
  readonly delta: number; // negative = consumed, positive = added
  readonly unit: BatchQuantityUnitT;
  readonly mutationId: string;
  readonly createdAt: string; // ISO datetime
}

export interface BatchSnapshot {
  readonly initialQuantity: number;
  readonly initialQuantityUnit: BatchQuantityUnitT;
}

/**
 * Compute the canonical remaining quantity from the immutable ledger of
 * adjustments. Idempotency is enforced via `mutationId` deduplication —
 * repeats are silently dropped (this matches what the Worker will do at
 * the API boundary, so client + server stay in agreement).
 *
 * Refuses adjustments whose unit doesn't match the batch's `initialQuantityUnit`.
 * Refuses adjustments that would drive `remaining` below 0 — that's a sign
 * of state divergence and the UI surfaces it explicitly.
 */
export function computeRemainingFromLedger(
  batch: BatchSnapshot,
  adjustments: readonly LedgerAdjustment[],
): number {
  assertNonNegativeFinite(batch.initialQuantity, 'initialQuantity');

  const seen = new Set<string>();
  let remaining = batch.initialQuantity;

  for (const adj of adjustments) {
    if (seen.has(adj.mutationId)) continue;
    seen.add(adj.mutationId);

    if (adj.unit !== batch.initialQuantityUnit) {
      throw new MathError(
        'UNIT_MISMATCH',
        `Adjustment unit (${adj.unit}) must match batch unit (${batch.initialQuantityUnit})`,
        { mutationId: adj.mutationId, expected: batch.initialQuantityUnit, got: adj.unit },
      );
    }
    if (!Number.isFinite(adj.delta) || adj.delta === 0) {
      throw new MathError('NEGATIVE_INPUT', 'Ledger delta must be non-zero finite', {
        mutationId: adj.mutationId,
        delta: adj.delta,
      });
    }

    const next = remaining + adj.delta;
    if (next < 0) {
      throw new MathError(
        'NEGATIVE_INPUT',
        `Adjustment ${adj.mutationId} would drive remaining below zero (${remaining} + ${adj.delta} = ${next})`,
        { mutationId: adj.mutationId, remaining, delta: adj.delta },
      );
    }
    remaining = next;
  }

  return remaining;
}

export interface ForecastInput {
  readonly remaining: number;
  /** Average daily consumption rate in the batch's unit. */
  readonly dailyConsumption: number;
}

/**
 * Linear depletion forecast. Returns the number of full days of supply
 * remaining at the current consumption rate. Returns Infinity when
 * dailyConsumption is 0 (no protocol drawing from this batch).
 */
export function forecastDaysRemaining(input: ForecastInput): number {
  assertNonNegativeFinite(input.remaining, 'remaining');
  assertNonNegativeFinite(input.dailyConsumption, 'dailyConsumption');
  if (input.dailyConsumption === 0) return Infinity;
  return input.remaining / input.dailyConsumption;
}

/**
 * Apply Undo: produce a compensating adjustment that exactly cancels the
 * referenced original. The compensating adjustment carries its own fresh
 * `mutationId` and `createdAt`, but its `delta` is the negation of the
 * original. The Worker's idempotency layer prevents double-undo.
 */
export function compensateAdjustment(
  original: LedgerAdjustment,
  newMutationId: string,
  createdAt: string,
): LedgerAdjustment {
  if (original.delta === 0) {
    throw new MathError('NEGATIVE_INPUT', 'Cannot compensate a zero-delta adjustment', {
      original,
    });
  }
  return {
    delta: -original.delta,
    unit: original.unit,
    mutationId: newMutationId,
    createdAt,
  };
}
