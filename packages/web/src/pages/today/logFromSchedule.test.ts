import { describe, expect, it } from 'vitest';
import { computeAdjustment } from './logFromSchedule';
import type { InventoryBatch } from '@/db';

function reconstitutedBatch(overrides: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: 'b1',
    householdId: 'hh',
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
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    version: 0,
    creatorUserId: 'u1',
    shareScope: 'household',
    ...overrides,
  };
}

describe('computeAdjustment', () => {
  it('computes mL withdrawn for an injectable batch', () => {
    // 250 mcg / (2.5 mg/mL = 2500 mcg/mL) = 0.1 mL.
    const a = computeAdjustment(reconstitutedBatch(), 250, 'mcg');
    expect(a).not.toBeNull();
    expect(a!.unit).toBe('mL');
    expect(a!.delta).toBeCloseTo(-0.1, 5);
  });

  it('refuses IU dose units for injectables', () => {
    expect(computeAdjustment(reconstitutedBatch(), 5, 'IU')).toBeNull();
  });

  it('refuses IU concentration units', () => {
    const batch = reconstitutedBatch({
      reconstitution: {
        reconstitutedAt: '2026-04-01T00:00:00Z',
        diluentVolumeMl: 2,
        diluentType: 'bac_water',
        resultingConcentration: { value: 100, unit: 'IU', perMl: true },
        byUserId: 'u1',
      },
    });
    expect(computeAdjustment(batch, 250, 'mcg')).toBeNull();
  });

  it('decrements 1 capsule per dose', () => {
    const batch = reconstitutedBatch({
      initialQuantityUnit: 'capsules',
      initialQuantity: 30,
      remainingQuantity: 30,
      status: 'sealed',
      reconstitution: undefined,
    });
    const a = computeAdjustment(batch, 500, 'mg');
    expect(a).toEqual({
      batchId: batch.id,
      delta: -1,
      unit: 'capsules',
      reason: 'dose_log',
    });
  });

  it('decrements mass when batch and dose share mass-form units', () => {
    const batch = reconstitutedBatch({
      initialQuantityUnit: 'mg',
      initialQuantity: 1000,
      remainingQuantity: 1000,
      status: 'sealed',
      reconstitution: undefined,
    });
    // 500 mg dose out of an mg batch = -500 mg.
    const a = computeAdjustment(batch, 500, 'mg');
    expect(a).not.toBeNull();
    expect(a!.unit).toBe('mg');
    expect(a!.delta).toBeCloseTo(-500, 5);
  });

  it('returns null when batch unit cannot be matched to dose unit', () => {
    // Sealed mg-batch + mL dose → no recipe (no concentration to bridge mass↔volume).
    const batch = reconstitutedBatch({
      initialQuantityUnit: 'mg',
      initialQuantity: 1000,
      remainingQuantity: 1000,
      status: 'sealed',
      reconstitution: undefined,
    });
    expect(computeAdjustment(batch, 1, 'mL')).toBeNull();
  });
});
