import { describe, expect, it } from 'vitest';
import {
  compensateAdjustment,
  computeRemainingFromLedger,
  forecastDaysRemaining,
  type LedgerAdjustment,
} from './ledger.js';
import { MathError } from '../math/errors.js';

const adj = (
  delta: number,
  mutationId: string,
  unit: LedgerAdjustment['unit'] = 'mL',
): LedgerAdjustment => ({
  delta,
  unit,
  mutationId,
  createdAt: '2026-04-29T10:00:00Z',
});

describe('computeRemainingFromLedger', () => {
  it('returns initialQuantity when ledger is empty', () => {
    expect(computeRemainingFromLedger({ initialQuantity: 2, initialQuantityUnit: 'mL' }, [])).toBe(
      2,
    );
  });

  it('subtracts consumption deltas', () => {
    const remaining = computeRemainingFromLedger(
      { initialQuantity: 2, initialQuantityUnit: 'mL' },
      [adj(-0.1, 'm1'), adj(-0.1, 'm2'), adj(-0.1, 'm3')],
    );
    expect(remaining).toBeCloseTo(1.7, 9);
  });

  it('idempotency: duplicate mutationId is dropped', () => {
    const remaining = computeRemainingFromLedger(
      { initialQuantity: 2, initialQuantityUnit: 'mL' },
      [adj(-0.1, 'm1'), adj(-0.1, 'm1'), adj(-0.1, 'm2')],
    );
    expect(remaining).toBeCloseTo(1.8, 9);
  });

  it('refuses unit mismatch', () => {
    expect(() =>
      computeRemainingFromLedger({ initialQuantity: 2, initialQuantityUnit: 'mL' }, [
        adj(-0.1, 'm1', 'mg'),
      ]),
    ).toThrow(MathError);
  });

  it('refuses zero / non-finite delta', () => {
    expect(() =>
      computeRemainingFromLedger({ initialQuantity: 2, initialQuantityUnit: 'mL' }, [adj(0, 'm1')]),
    ).toThrow(MathError);
    expect(() =>
      computeRemainingFromLedger({ initialQuantity: 2, initialQuantityUnit: 'mL' }, [
        adj(NaN, 'm1'),
      ]),
    ).toThrow(MathError);
  });

  it('refuses overdraw', () => {
    expect(() =>
      computeRemainingFromLedger({ initialQuantity: 1, initialQuantityUnit: 'mL' }, [
        adj(-2, 'm1'),
      ]),
    ).toThrow(MathError);
  });

  it('Undo round-trip: orig + compensate = no-op', () => {
    const original = adj(-0.1, 'orig-1');
    const compensating = compensateAdjustment(original, 'comp-1', '2026-04-29T10:01:00Z');
    expect(
      computeRemainingFromLedger({ initialQuantity: 2, initialQuantityUnit: 'mL' }, [
        original,
        compensating,
      ]),
    ).toBe(2);
  });

  it('compensateAdjustment refuses zero-delta originals', () => {
    expect(() =>
      compensateAdjustment(
        { delta: 0, unit: 'mL', mutationId: 'orig', createdAt: '2026-04-29T10:00:00Z' },
        'comp',
        '2026-04-29T10:00:00Z',
      ),
    ).toThrow(MathError);
  });
});

describe('forecastDaysRemaining', () => {
  it('linear projection', () => {
    expect(forecastDaysRemaining({ remaining: 2, dailyConsumption: 0.1 })).toBe(20);
  });

  it('zero consumption returns Infinity', () => {
    expect(forecastDaysRemaining({ remaining: 2, dailyConsumption: 0 })).toBe(Infinity);
  });

  it('refuses negative inputs', () => {
    expect(() => forecastDaysRemaining({ remaining: -1, dailyConsumption: 0.1 })).toThrow(
      MathError,
    );
    expect(() => forecastDaysRemaining({ remaining: 1, dailyConsumption: -0.1 })).toThrow(
      MathError,
    );
  });
});
