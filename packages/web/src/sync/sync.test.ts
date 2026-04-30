import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainOutbox, pendingCount } from './drainer.js';
import { pullAndMerge } from './puller.js';
import { makeFakeServer, makeFakeTransport } from './test-helpers.js';
import { makeTestDb, seedHousehold, type TestSeed } from '../db/test-helpers.js';
import { InventoryItemRepo, DoseLogRepo } from '../db/repos/index.js';
import { newId, nowIso } from '../db/ids.js';
import { readCursor, writeConfig } from './config.js';
import type { PeptideDb } from '../db/schema.js';
import type { DoseLog } from '../db/types.js';

let db: PeptideDb;
let seed: TestSeed;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
  seed = await seedHousehold(db);
  // Configure the engine for sync — drainer + puller read this directly.
  await writeConfig(db, { workerUrl: 'http://test/' });
});

afterEach(() => {
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

describe('drainOutbox', () => {
  it('pushes pending entries and acks each on apply', async () => {
    await new InventoryItemRepo(db).upsert({ ...seed.bpc, notesMd: 'change-1' });
    await new InventoryItemRepo(db).upsert({ ...seed.bpc, notesMd: 'change-2' });
    expect(await pendingCount(db)).toBe(2);

    const server = makeFakeServer(seed.household.id);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    const result = await drainOutbox(db, transport);

    expect(result.applied).toBe(2);
    expect(result.rejected).toBe(0);
    expect(await pendingCount(db)).toBe(0);
    // Both rows landed on the server.
    expect(server.rows['inventoryItem']?.size).toBe(1); // same id, two updates
  });

  it('replays without re-applying on retry', async () => {
    await new InventoryItemRepo(db).upsert({ ...seed.bpc, notesMd: 'change-once' });

    const server = makeFakeServer(seed.household.id);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    await drainOutbox(db, transport);
    // Drainer acked the row; manually un-ack to simulate a retry path.
    const all = await db.outbox.toArray();
    for (const row of all) {
      await db.outbox.put({ ...row, ackedAt: null });
    }

    const result = await drainOutbox(db, transport);
    expect(result.replayed).toBe(1);
    expect(result.applied).toBe(0);
  });

  it('bumps retryCount when transport throws', async () => {
    await new InventoryItemRepo(db).upsert({ ...seed.bpc, notesMd: 'will-fail' });
    const server = makeFakeServer(seed.household.id);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    transport.failNextPushWith = { code: 'NETWORK_DOWN', message: 'offline', status: 0 };
    const result = await drainOutbox(db, transport);
    expect(result.attempted).toBe(1);
    expect(result.applied).toBe(0);
    expect(result.errors[0]?.code).toBe('NETWORK_DOWN');
    const row = (await db.outbox.toArray())[0];
    expect(row?.retryCount).toBe(1);
    expect(row?.lastError).toContain('offline');
  });

  it('skips parked entries (retryCount >= MAX_RETRIES)', async () => {
    await new InventoryItemRepo(db).upsert({ ...seed.bpc, notesMd: 'parked' });
    const all = await db.outbox.toArray();
    for (const row of all) {
      await db.outbox.put({ ...row, retryCount: 99 });
    }

    const server = makeFakeServer(seed.household.id);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    const result = await drainOutbox(db, transport);
    expect(result.attempted).toBe(0);
    expect(result.applied).toBe(0);
  });

  it('returns skipped: true when transport is in no-op mode', async () => {
    await writeConfig(db, { workerUrl: '' });
    await new InventoryItemRepo(db).upsert({ ...seed.bpc, notesMd: 'no transport' });

    const transport = {
      async pull() {
        return null;
      },
      async push() {
        return null;
      },
    };
    const result = await drainOutbox(db, transport);
    expect(result.skipped).toBe(true);
  });
});

describe('pullAndMerge', () => {
  it('merges new rows from server and advances cursor', async () => {
    const server = makeFakeServer(seed.household.id);
    // Server already holds a fresh inventoryItem the client has never seen.
    const newItemId = newId();
    server.rows['inventoryItem'] = new Map([
      [
        newItemId,
        {
          id: newItemId,
          householdId: seed.household.id,
          createdAt: '2026-04-30T00:00:00.000Z',
          updatedAt: '2026-04-30T00:00:00.000Z',
          version: 1,
          name: 'Server-only item',
          form: 'capsule',
        },
      ],
    ]);

    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    const result = await pullAndMerge(db, transport);
    expect(result.skipped).toBe(false);
    expect(result.merged['inventoryItem']).toBe(1);

    const local = await db.inventoryItems.get(newItemId);
    expect(local?.name).toBe('Server-only item');

    const cursor = await readCursor(db);
    expect(cursor).toBeTruthy();
  });

  it('skips incoming rows older than local copy (LWW)', async () => {
    // Local has a newer version of seed.bpc than what the server is sending.
    await db.inventoryItems.put({
      ...seed.bpc,
      updatedAt: '2099-01-01T00:00:00.000Z',
      name: 'Local-only-newer',
    });
    const server = makeFakeServer(seed.household.id);
    server.rows['inventoryItem'] = new Map([
      [
        seed.bpc.id,
        {
          id: seed.bpc.id,
          householdId: seed.household.id,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          version: 0,
          name: 'Server-stale',
          form: seed.bpc.form,
        },
      ],
    ]);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    const result = await pullAndMerge(db, transport);
    expect(result.skippedRows['inventoryItem']).toBe(1);
    expect(result.merged['inventoryItem'] ?? 0).toBe(0);
    const local = await db.inventoryItems.get(seed.bpc.id);
    expect(local?.name).toBe('Local-only-newer');
  });

  it('force=true ignores cursor', async () => {
    const server = makeFakeServer(seed.household.id);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });
    await pullAndMerge(db, transport);
    const beforeCursor = await readCursor(db);
    expect(beforeCursor).toBeTruthy();

    transport.callsToPull.length = 0;
    await pullAndMerge(db, transport, { force: true });
    expect(transport.callsToPull[0]?.since).toBeNull();
  });
});

describe('end-to-end convergence', () => {
  it('offline mutate → reconnect → drain → pull → server has the change', async () => {
    const server = makeFakeServer(seed.household.id);
    const transport = makeFakeTransport({
      onPull: (since) => server.pull(since),
      onPush: (mutations) => server.push(mutations),
    });

    // 1. Client logs a dose offline (no transport call).
    const repo = new DoseLogRepo(db);
    await repo.create({
      log: buildLog(),
      adjustment: { batchId: seed.batch.id, delta: -0.1, unit: 'mL', reason: 'dose_log' },
    });
    expect(await pendingCount(db)).toBe(2); // doseLog + adjustment

    // 2. Online — drain pushes both mutations.
    await drainOutbox(db, transport);
    expect(await pendingCount(db)).toBe(0);
    expect(server.rows['doseLog']?.size).toBe(1);
    expect(server.rows['inventoryAdjustment']?.size).toBe(1);

    // 3. A second device pulls fresh from the server.
    const otherDb = makeTestDb();
    await otherDb.open();
    await writeConfig(otherDb, { workerUrl: 'http://test/' });
    await pullAndMerge(otherDb, transport);
    expect(await otherDb.doseLogs.count()).toBe(1);
    expect(await otherDb.inventoryAdjustments.count()).toBe(1);
    otherDb.close();
  });
});
