// Pure batch burn-down: walk pending schedules in chronological order and
// project remaining quantity as each dose fires. Reuses the dose-deduction
// recipe from the today/logFromSchedule path so the projection matches what
// will actually happen when the user logs each dose.
//
// Returns one point per scheduled dose (date, remaining-after-this-dose) so
// the caller can render a step-line chart.

import type { DoseSchedule, InventoryBatch, ProtocolItem } from '@/db';
import { computeAdjustment } from '@/pages/today/logFromSchedule';

export interface BurndownInput {
  readonly batch: InventoryBatch;
  /** All pending schedules; we filter to those that target this batch. */
  readonly schedules: readonly DoseSchedule[];
  /** Protocol items for the schedules' dose-amount + unit. */
  readonly protocolItems: readonly ProtocolItem[];
  /** Hard cap on look-ahead, days. Defaults to 60. */
  readonly horizonDays?: number;
}

export interface BurndownPoint {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** Remaining quantity AFTER this dose fires, in `batch.initialQuantityUnit`. */
  readonly remaining: number;
}

export interface BurndownResult {
  readonly points: BurndownPoint[];
  /** First date the projection hits zero (or null if never within horizon). */
  readonly depletesOn: string | null;
  /** Total projected doses applied. */
  readonly dosesApplied: number;
  /** Reason if projection is incomplete (e.g. unsupported dose unit). */
  readonly reason?: 'no_recipe' | 'no_schedules';
}

const DEFAULT_HORIZON = 60;

export function computeBurndown(input: BurndownInput): BurndownResult {
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON;
  const protocolItemById = new Map(input.protocolItems.map((p) => [p.id, p]));

  const relevant = input.schedules
    .filter((s) => !s.deletedAt && s.status === 'pending' && belongsToBatch(s, input.batch, input.protocolItems))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  if (relevant.length === 0) {
    return {
      points: [{ date: today(), remaining: input.batch.remainingQuantity }],
      depletesOn: null,
      dosesApplied: 0,
      reason: 'no_schedules',
    };
  }

  const horizon = new Date(Date.now() + horizonDays * 24 * 3600_000).toISOString();
  const points: BurndownPoint[] = [
    { date: today(), remaining: input.batch.remainingQuantity },
  ];
  let remaining = input.batch.remainingQuantity;
  let depletesOn: string | null = null;
  let recipeMissing = false;
  let dosesApplied = 0;

  for (const s of relevant) {
    if (s.scheduledFor > horizon) break;
    const pi = s.protocolItemId ? protocolItemById.get(s.protocolItemId) : undefined;
    const doseAmount = pi?.doseAmount ?? s.doseAmount;
    const doseUnit = pi?.doseUnit ?? s.doseUnit;
    const adj = computeAdjustment(input.batch, doseAmount, doseUnit);
    if (!adj) {
      recipeMissing = true;
      continue;
    }
    remaining = Math.max(0, remaining + adj.delta); // adj.delta is negative
    dosesApplied += 1;
    points.push({ date: s.scheduledFor.slice(0, 10), remaining });
    if (remaining <= 0 && depletesOn === null) {
      depletesOn = s.scheduledFor.slice(0, 10);
      break;
    }
  }

  return {
    points,
    depletesOn,
    dosesApplied,
    ...(recipeMissing && dosesApplied === 0 ? { reason: 'no_recipe' as const } : {}),
  };
}

function belongsToBatch(
  s: DoseSchedule,
  batch: InventoryBatch,
  items: readonly ProtocolItem[],
): boolean {
  if (s.itemId !== batch.itemId) return false;
  if (!s.protocolItemId) return true; // ad-hoc schedule for this item
  const pi = items.find((p) => p.id === s.protocolItemId);
  if (!pi) return false;
  // Honor preferredBatchId if set; otherwise any batch of the same item is in scope.
  if (pi.preferredBatchId && pi.preferredBatchId !== batch.id) return false;
  return true;
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
