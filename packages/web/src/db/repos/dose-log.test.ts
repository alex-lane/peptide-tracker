import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DoseLogRepo } from './dose-log.js';
import { makeTestDb, seedHousehold, type TestSeed } from '../test-helpers.js';
import { newId, nowIso } from '../ids.js';
import type { PeptideDb } from '../schema.js';
import type { DoseLog } from '../types.js';

let db: PeptideDb;
let seed: TestSeed;
let repo: DoseLogRepo;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
  seed = await seedHousehold(db);
  repo = new DoseLogRepo(db);
});

afterEach(async () => {
  db.close();
});

const buildLog = (over: Partial<DoseLog> = {}): DoseLog => ({
  id: newId(),
  householdId: seed.household.id,
  userId: seed.alex.id,
  itemId: seed.bpc.id,
  batchId: seed.batch.id,
  doseAmount: 250,
  doseUnit: 'mcg',
  method: 'subq',
  injectionSite: 'abd_ul',
  takenAt: nowIso(),
  createdAt: nowIso(),
  updatedAt: nowIso(),
  version: 0,
  ...over,
});

describe('DoseLogRepo.create — atomic write', () => {
  it('writes log + adjustment + batch update + 3 outbox rows in one shot', async () => {
    const before = await db.inventoryBatches.get(seed.batch.id);
    const result = await repo.create({
      log: buildLog(),
      adjustment: { batchId: seed.batch.id, delta: -0.1, unit: 'mL', reason: 'dose_log' },
    });

    expect(result.adjustment).toBeDefined();
    expect(result.adjustment?.delta).toBe(-0.1);

    const logs = await db.doseLogs.toArray();
    expect(logs.length).toBe(1);

    const adjustments = await db.inventoryAdjustments.toArray();
    expect(adjustments.length).toBe(1);
    expect(adjustments[0]?.refDoseLogId).toBe(result.log.id);

    // Cached remaining quantity tracks the delta.
    const after = await db.inventoryBatches.get(seed.batch.id);
    expect(after?.remainingQuantity).toBeCloseTo((before?.remainingQuantity ?? 0) - 0.1, 6);

    // Outbox carries doseLog + inventoryAdjustment + inventoryBatch.
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(3);
    expect(outbox.map((o) => o.entity).sort()).toEqual([
      'doseLog',
      'inventoryAdjustment',
      'inventoryBatch',
    ]);
  });

  it('skips inventory adjustment when none is supplied', async () => {
    const result = await repo.create({ log: buildLog() });
    expect(result.adjustment).toBeUndefined();
    expect(await db.inventoryAdjustments.count()).toBe(0);
    expect(await db.outbox.count()).toBe(1);
  });

  it('rejects an invalid log with NO partial writes (validate-before-tx)', async () => {
    const bad = buildLog({ doseAmount: -1 }); // negative amount → schema rejects
    await expect(repo.create({ log: bad })).rejects.toThrow();
    expect(await db.doseLogs.count()).toBe(0);
    expect(await db.inventoryAdjustments.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('rejects an invalid adjustment with NO partial writes', async () => {
    const log = buildLog();
    await expect(
      repo.create({
        log,
        adjustment: { batchId: seed.batch.id, delta: 0, unit: 'mL', reason: 'dose_log' },
      }),
    ).rejects.toThrow();
    expect(await db.doseLogs.count()).toBe(0);
    expect(await db.inventoryAdjustments.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('DoseLogRepo.undo — compensating ledger entry', () => {
  it('round-trip: original delta + compensation = no-op', async () => {
    const result = await repo.create({
      log: buildLog(),
      adjustment: { batchId: seed.batch.id, delta: -0.1, unit: 'mL', reason: 'dose_log' },
    });
    await repo.undo(result.log.id);

    const adjustments = await db.inventoryAdjustments.toArray();
    expect(adjustments.length).toBe(2);
    const sum = adjustments.reduce((acc, a) => acc + a.delta, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-9);

    const log = await db.doseLogs.get(result.log.id);
    expect(log?.deletedAt).toBeDefined();

    const outbox = await db.outbox.toArray();
    expect(outbox.some((o) => o.entity === 'doseLog' && o.op === 'delete')).toBe(true);
    expect(outbox.some((o) => o.entity === 'inventoryAdjustment' && o.op === 'compensate')).toBe(
      true,
    );
  });

  it('refuses to undo an already-undone log', async () => {
    const result = await repo.create({
      log: buildLog(),
      adjustment: { batchId: seed.batch.id, delta: -0.1, unit: 'mL', reason: 'dose_log' },
    });
    await repo.undo(result.log.id);
    await expect(repo.undo(result.log.id)).rejects.toThrow(/already undone/);
  });

  it('refuses to undo a missing log', async () => {
    await expect(repo.undo('00000000-0000-4000-8000-000000000000')).rejects.toThrow(/not found/);
  });

  it('handles a log with no inventory adjustment cleanly', async () => {
    const result = await repo.create({ log: buildLog() });
    await repo.undo(result.log.id);
    const log = await db.doseLogs.get(result.log.id);
    expect(log?.deletedAt).toBeDefined();
    // No compensating adjustment should be written.
    expect(await db.inventoryAdjustments.count()).toBe(0);
  });
});
