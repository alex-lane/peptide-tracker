import { describe, expect, it } from 'vitest';
import { projectDepletion } from './depletion';
import type { DoseSchedule, InventoryBatch, ProtocolItem } from '@/db';

const HH = 'hh';

function makeBatch(overrides: Partial<InventoryBatch>): InventoryBatch {
  return {
    id: 'b1',
    householdId: HH,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    version: 0,
    itemId: 'p1',
    initialQuantity: 2,
    initialQuantityUnit: 'mL',
    remainingQuantity: 2,
    status: 'reconstituted',
    reconstitution: {
      reconstitutedAt: '2026-04-01T00:00:00Z',
      diluentVolumeMl: 2,
      diluentType: 'bac_water',
      resultingConcentration: { value: 2.5, unit: 'mg', perMl: true },
      byUserId: 'u1',
    },
    ...overrides,
  };
}

function makeItem(overrides: Partial<ProtocolItem>): ProtocolItem {
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
    ...overrides,
  };
}

function makeSchedules(itemId: string, n: number): DoseSchedule[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    householdId: HH,
    userId: 'u1',
    protocolItemId: itemId,
    itemId: 'p1',
    scheduledFor: `2026-04-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    status: 'pending',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    version: 0,
  }));
}

describe('projectDepletion — injectables', () => {
  it('projects depletion for a 2.5mg/mL vial dosed 250mcg/day', () => {
    // 250mcg / 2500 mcg/mL = 0.1 mL/dose. 2 mL initial → drains at dose 20.
    const out = projectDepletion({
      items: [makeItem({})],
      batches: [makeBatch({})],
      schedules: makeSchedules('pi1', 30),
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.depletesOn).toBe('2026-04-20');
    expect(out[0]?.dosesProjected).toBe(20);
  });

  it('returns null depletesOn when schedules do not drain the batch', () => {
    const out = projectDepletion({
      items: [makeItem({})],
      batches: [makeBatch({})],
      schedules: makeSchedules('pi1', 5),
    });
    expect(out[0]?.depletesOn).toBeNull();
    expect(out[0]?.dosesProjected).toBe(5);
  });

  it('skips items without a preferredBatchId', () => {
    const out = projectDepletion({
      items: [makeItem({ preferredBatchId: undefined })],
      batches: [makeBatch({})],
      schedules: makeSchedules('pi1', 30),
    });
    expect(out).toHaveLength(0);
  });

  it('flags IU doses as unsupported', () => {
    const out = projectDepletion({
      items: [makeItem({ doseUnit: 'IU' })],
      batches: [makeBatch({})],
      schedules: makeSchedules('pi1', 30),
    });
    expect(out[0]?.reason).toBe('unit_unsupported');
    expect(out[0]?.depletesOn).toBeNull();
  });
});

describe('projectDepletion — capsules', () => {
  it('decrements 1 capsule per scheduled occurrence', () => {
    const batch = makeBatch({
      initialQuantity: 30,
      initialQuantityUnit: 'capsules',
      remainingQuantity: 30,
      status: 'sealed',
      reconstitution: undefined,
    });
    const out = projectDepletion({
      items: [makeItem({ doseUnit: 'mg' })],
      batches: [batch],
      schedules: makeSchedules('pi1', 60),
    });
    expect(out[0]?.depletesOn).toBe('2026-04-30');
    expect(out[0]?.dosesProjected).toBe(30);
  });
});
