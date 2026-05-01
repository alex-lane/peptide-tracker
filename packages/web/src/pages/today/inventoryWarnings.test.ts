import { describe, expect, it } from 'vitest';
import { computeInventoryWarnings } from './inventoryWarnings';
import type { DoseSchedule, InventoryBatch } from '@/db';

function makeBatch(overrides: Partial<InventoryBatch>): InventoryBatch {
  return {
    id: 'b1',
    householdId: 'hh',
    itemId: 'p1',
    initialQuantity: 2,
    initialQuantityUnit: 'mL',
    remainingQuantity: 2,
    status: 'reconstituted',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    version: 0,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<DoseSchedule>): DoseSchedule {
  return {
    id: 's1',
    householdId: 'hh',
    userId: 'u1',
    itemId: 'p1',
    scheduledFor: '2026-05-02T08:00:00.000Z',
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    status: 'pending',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    version: 0,
    ...overrides,
  };
}

describe('computeInventoryWarnings', () => {
  it('flags a batch whose discard-by date has passed', () => {
    const b = makeBatch({
      reconstitution: {
        reconstitutedAt: '2026-04-01T00:00:00Z',
        diluentVolumeMl: 2,
        diluentType: 'bac_water',
        resultingConcentration: { value: 2.5, unit: 'mg', perMl: true },
        discardByAt: '2026-04-30T00:00:00Z',
        byUserId: 'u1',
      },
    });
    const out = computeInventoryWarnings({
      batches: [b],
      schedules: [],
      now: new Date('2026-05-01T00:00:00Z'),
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('discard_by_passed');
  });

  it('flags expiring within the window', () => {
    const b = makeBatch({ expiresAt: '2026-05-10T00:00:00Z' });
    const out = computeInventoryWarnings({
      batches: [b],
      schedules: [],
      now: new Date('2026-05-01T00:00:00Z'),
    });
    expect(out[0]?.kind).toBe('expiring_soon');
    expect(out[0]?.daysUntil).toBeGreaterThanOrEqual(8);
    expect(out[0]?.daysUntil).toBeLessThanOrEqual(9);
  });

  it('does not flag expirations outside the window', () => {
    const b = makeBatch({ expiresAt: '2026-08-01T00:00:00Z' });
    const out = computeInventoryWarnings({
      batches: [b],
      schedules: [],
      now: new Date('2026-05-01T00:00:00Z'),
    });
    expect(out).toHaveLength(0);
  });

  it('flags low-forecast when remaining quantity is small relative to upcoming demand', () => {
    const b = makeBatch({ remainingQuantity: 1.5 });
    const upcoming = [
      makeSchedule({ scheduledFor: '2026-05-02T08:00:00Z' }),
      makeSchedule({ id: 's2', scheduledFor: '2026-05-03T08:00:00Z' }),
      makeSchedule({ id: 's3', scheduledFor: '2026-05-04T08:00:00Z' }),
    ];
    const out = computeInventoryWarnings({
      batches: [b],
      schedules: upcoming,
      now: new Date('2026-05-01T00:00:00Z'),
    });
    expect(out.some((w) => w.kind === 'low_forecast')).toBe(true);
  });

  it('skips deleted batches', () => {
    const b = makeBatch({ deletedAt: '2026-04-15T00:00:00Z', expiresAt: '2026-05-02T00:00:00Z' });
    const out = computeInventoryWarnings({
      batches: [b],
      schedules: [],
      now: new Date('2026-05-01T00:00:00Z'),
    });
    expect(out).toHaveLength(0);
  });
});
