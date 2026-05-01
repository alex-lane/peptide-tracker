// Pure function: classifies batches into "discard-by passed", "expiring soon",
// or "low forecast" warnings given the user's pending schedules.

import type { DoseSchedule, InventoryBatch } from '@/db';

export type WarningKind = 'discard_by_passed' | 'expiring_soon' | 'low_forecast';

export interface InventoryWarning {
  batchId: string;
  itemId: string;
  kind: WarningKind;
  /** Human description (status pill copy). */
  message: string;
  /** Days until trigger (negative = already triggered). */
  daysUntil: number;
}

export interface ComputeArgs {
  batches: readonly InventoryBatch[];
  schedules: readonly DoseSchedule[];
  now?: Date;
  /** Threshold for "expiring soon" warnings, in days. */
  expiringWindowDays?: number;
  /** Threshold for "low forecast" warnings, in days. */
  lowForecastDays?: number;
}

export function computeInventoryWarnings(args: ComputeArgs): InventoryWarning[] {
  const now = args.now ?? new Date();
  const expiringWindow = args.expiringWindowDays ?? 14;
  const lowForecast = args.lowForecastDays ?? 7;
  const out: InventoryWarning[] = [];

  for (const b of args.batches) {
    if (b.deletedAt) continue;

    // Discard-by passed (reconstituted vials).
    if (b.reconstitution?.discardByAt) {
      const days = daysBetween(now, new Date(b.reconstitution.discardByAt));
      if (days <= 0) {
        out.push({
          batchId: b.id,
          itemId: b.itemId,
          kind: 'discard_by_passed',
          message: 'Past discard-by date',
          daysUntil: days,
        });
        continue;
      }
    }

    // Expiring soon (sealed expiry).
    if (b.expiresAt) {
      const days = daysBetween(now, new Date(b.expiresAt));
      if (days >= 0 && days <= expiringWindow) {
        out.push({
          batchId: b.id,
          itemId: b.itemId,
          kind: 'expiring_soon',
          message: `Expires in ${days} day${days === 1 ? '' : 's'}`,
          daysUntil: days,
        });
        continue;
      }
    }

    // Low-forecast: count-form batches only (capsules / tablets / sprays /
    // drops), where 1 dose ≈ 1 batch unit and a count comparison is honest.
    // Injectables / mass-form batches need real per-dose math — that's what
    // protocols/depletion.projectDepletion is for; we deliberately don't
    // re-implement it here.
    const isCountForm =
      b.initialQuantityUnit === 'capsules' ||
      b.initialQuantityUnit === 'tablets' ||
      b.initialQuantityUnit === 'sprays' ||
      b.initialQuantityUnit === 'drops';
    if (isCountForm && b.remainingQuantity > 0) {
      const horizon = new Date(now.getTime() + lowForecast * 24 * 3600_000);
      const upcomingForBatch = args.schedules.filter(
        (s) =>
          !s.deletedAt &&
          s.status === 'pending' &&
          s.itemId === b.itemId &&
          new Date(s.scheduledFor) <= horizon &&
          new Date(s.scheduledFor) >= now,
      );
      if (upcomingForBatch.length === 0) continue;
      // Each pending dose draws ~1 unit; warn when remaining covers fewer
      // than 2× the upcoming demand.
      if (b.remainingQuantity <= upcomingForBatch.length * 2) {
        out.push({
          batchId: b.id,
          itemId: b.itemId,
          kind: 'low_forecast',
          message: `Low: ${upcomingForBatch.length} pending dose${upcomingForBatch.length === 1 ? '' : 's'} in next ${lowForecast}d`,
          daysUntil: lowForecast,
        });
      }
    }
  }

  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

function daysBetween(now: Date, target: Date): number {
  const ms = target.getTime() - now.getTime();
  return Math.floor(ms / (24 * 3600_000));
}
