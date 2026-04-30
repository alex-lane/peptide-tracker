import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@/db/test-helpers';
import { deletePreset, readPreset, writePreset } from './presets';
import type { PeptideDb } from '@/db';

let db: PeptideDb;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
});

afterEach(() => {
  db.close();
});

describe('calculator presets', () => {
  it('returns null when no preset exists', async () => {
    expect(await readPreset(db, 'unknown-item')).toBeNull();
  });

  it('round-trips a preset', async () => {
    await writePreset(db, {
      itemId: 'item-1',
      vialMass: '5',
      vialMassUnit: 'mg',
      diluentMl: '2',
      diluentType: 'bac_water',
      lastDoseAmount: '250',
      lastDoseUnit: 'mcg',
      syringeScale: 'U-100',
      savedAt: '2026-04-30T00:00:00.000Z',
    });
    const got = await readPreset(db, 'item-1');
    expect(got).not.toBeNull();
    expect(got?.vialMass).toBe('5');
    expect(got?.lastDoseUnit).toBe('mcg');
    // savedAt is replaced with current time on write.
    expect(got?.savedAt).not.toBe('2026-04-30T00:00:00.000Z');
  });

  it('isolates presets per item', async () => {
    await writePreset(db, {
      itemId: 'a',
      vialMass: '5',
      vialMassUnit: 'mg',
      diluentMl: '2',
      diluentType: 'bac_water',
      lastDoseAmount: '250',
      lastDoseUnit: 'mcg',
      syringeScale: 'U-100',
      savedAt: '2026-04-30T00:00:00.000Z',
    });
    await writePreset(db, {
      itemId: 'b',
      vialMass: '10',
      vialMassUnit: 'mg',
      diluentMl: '5',
      diluentType: 'bac_water',
      lastDoseAmount: '2',
      lastDoseUnit: 'mg',
      syringeScale: 'U-100',
      savedAt: '2026-04-30T00:00:00.000Z',
    });
    expect((await readPreset(db, 'a'))?.vialMass).toBe('5');
    expect((await readPreset(db, 'b'))?.vialMass).toBe('10');
  });

  it('delete removes the preset', async () => {
    await writePreset(db, {
      itemId: 'a',
      vialMass: '5',
      vialMassUnit: 'mg',
      diluentMl: '2',
      diluentType: 'bac_water',
      lastDoseAmount: '250',
      lastDoseUnit: 'mcg',
      syringeScale: 'U-100',
      savedAt: '2026-04-30T00:00:00.000Z',
    });
    await deletePreset(db, 'a');
    expect(await readPreset(db, 'a')).toBeNull();
  });
});
