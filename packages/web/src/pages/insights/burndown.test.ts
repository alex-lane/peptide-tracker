import { describe, expect, it } from 'vitest';
import { computeBurndown } from './burndown';
import type { DoseSchedule, InventoryBatch, ProtocolItem } from '@/db';

const NOW = '2026-04-01T00:00:00.000Z';

function makeBatch(over: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: 'b1',
    householdId: 'hh',
    itemId: 'p1',
    initialQuantity: 2,
    initialQuantityUnit: 'mL',
    remainingQuantity: 2,
    status: 'reconstituted',
    reconstitution: {
      reconstitutedAt: NOW,
      diluentVolumeMl: 2,
      diluentType: 'bac_water',
      resultingConcentration: { value: 2.5, unit: 'mg', perMl: true },
      byUserId: 'u1',
    },
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
    ...over,
  };
}

function makeProtocolItem(over: Partial<ProtocolItem> = {}): ProtocolItem {
  return {
    id: 'pi1',
    protocolId: 'pr1',
    itemId: 'p1',
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    rrule: 'FREQ=DAILY',
    timezone: 'UTC',
    localStartTime: '08:00',
    preferredBatchId: 'b1',
    ...over,
  };
}

function makeSchedule(idx: number, over: Partial<DoseSchedule> = {}): DoseSchedule {
  return {
    id: `s${idx}`,
    householdId: 'hh',
    userId: 'u1',
    protocolItemId: 'pi1',
    itemId: 'p1',
    scheduledFor: `2026-04-${String(idx + 1).padStart(2, '0')}T08:00:00.000Z`,
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    status: 'pending',
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
    ...over,
  };
}

describe('computeBurndown', () => {
  it('projects mL withdrawn per dose for an injectable batch', () => {
    // 250 mcg / 2500 mcg/mL = 0.1 mL/dose. 2 mL initial → drains in 20 doses.
    const schedules = Array.from({ length: 25 }, (_, i) => makeSchedule(i));
    const out = computeBurndown({
      batch: makeBatch(),
      schedules,
      protocolItems: [makeProtocolItem()],
    });
    expect(out.depletesOn).toBe('2026-04-20');
    expect(out.dosesApplied).toBe(20);
    // Initial point + 20 dose points = 21
    expect(out.points).toHaveLength(21);
    expect(out.points[0]?.remaining).toBe(2);
    expect(out.points[20]?.remaining).toBe(0);
  });

  it('returns null depletesOn when schedules do not drain the batch', () => {
    const out = computeBurndown({
      batch: makeBatch(),
      schedules: [makeSchedule(0), makeSchedule(1)],
      protocolItems: [makeProtocolItem()],
    });
    expect(out.depletesOn).toBeNull();
    expect(out.dosesApplied).toBe(2);
  });

  it('skips schedules with unsupported dose units (no recipe)', () => {
    const out = computeBurndown({
      batch: makeBatch(),
      schedules: [makeSchedule(0, { doseUnit: 'IU' })],
      protocolItems: [makeProtocolItem({ doseUnit: 'IU' })],
    });
    expect(out.dosesApplied).toBe(0);
    expect(out.reason).toBe('no_recipe');
  });

  it('only includes schedules whose protocol item targets this batch', () => {
    const out = computeBurndown({
      batch: makeBatch(),
      schedules: [
        makeSchedule(0, { protocolItemId: 'pi1' }),
        makeSchedule(1, { protocolItemId: 'pi2' }),
      ],
      protocolItems: [
        makeProtocolItem({ id: 'pi1', preferredBatchId: 'b1' }),
        makeProtocolItem({ id: 'pi2', preferredBatchId: 'b2' }),
      ],
    });
    expect(out.dosesApplied).toBe(1);
  });

  it('includes ad-hoc schedules without a protocol item when this is the only batch', () => {
    const out = computeBurndown({
      batch: makeBatch(),
      schedules: [makeSchedule(0, { protocolItemId: undefined })],
      protocolItems: [],
    });
    expect(out.dosesApplied).toBe(1);
  });

  it('does NOT attribute schedules to a batch when the protocol item has no preferred batch and a sibling exists', () => {
    // Two batches of the same item, protocol item has no preferredBatchId.
    // Without disambiguation, the same dose would count against BOTH batches.
    const out = computeBurndown({
      batch: makeBatch({ id: 'b1' }),
      siblingBatches: [makeBatch({ id: 'b2' })],
      schedules: [makeSchedule(0, { protocolItemId: 'pi1' })],
      protocolItems: [makeProtocolItem({ id: 'pi1', preferredBatchId: undefined })],
    });
    expect(out.dosesApplied).toBe(0);
    expect(out.reason).toBe('no_schedules');
  });

  it('attributes ad-hoc schedules only when there is exactly one batch of the item', () => {
    const out = computeBurndown({
      batch: makeBatch({ id: 'b1' }),
      siblingBatches: [makeBatch({ id: 'b2' })],
      schedules: [makeSchedule(0, { protocolItemId: undefined })],
      protocolItems: [],
    });
    expect(out.dosesApplied).toBe(0);
  });

  it('emits a single starting point when there are no relevant schedules', () => {
    const out = computeBurndown({
      batch: makeBatch(),
      schedules: [],
      protocolItems: [],
    });
    expect(out.points).toHaveLength(1);
    expect(out.reason).toBe('no_schedules');
  });
});
