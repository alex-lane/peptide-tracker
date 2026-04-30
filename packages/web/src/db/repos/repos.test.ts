import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HouseholdRepo,
  InventoryBatchRepo,
  InventoryItemRepo,
  ProtocolItemRepo,
  ProtocolRepo,
  UserProfileRepo,
} from './index.js';
import { makeTestDb, seedHousehold, type TestSeed } from '../test-helpers.js';
import { newId, nowIso } from '../ids.js';
import type { PeptideDb } from '../schema.js';
import type { Protocol, ProtocolItem } from '../types.js';

let db: PeptideDb;
let seed: TestSeed;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
  seed = await seedHousehold(db);
});

afterEach(async () => {
  db.close();
  // fake-indexeddb keeps databases between tests until explicitly deleted.
  // We use unique names per test so this isn't strictly required for
  // correctness, but it keeps memory bounded.
});

describe('Repo<T> base CRUD', () => {
  it('upsert stamps updatedAt and bumps version', async () => {
    const repo = new HouseholdRepo(db);
    const before = seed.household;
    const after = await repo.upsert({ ...before, name: 'Renamed' });
    expect(after.name).toBe('Renamed');
    expect(after.version).toBe(before.version + 1);
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it('upsert writes to outbox in the same transaction', async () => {
    const repo = new InventoryItemRepo(db);
    const item = {
      ...seed.bpc,
      version: seed.bpc.version, // simulate fresh read from disk
      notesMd: 'Updated notes',
    };
    await repo.upsert(item);
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.entity).toBe('inventoryItem');
    expect(outbox[0]?.op).toBe('upsert');
  });

  it('soft-delete sets deletedAt and writes a delete outbox row', async () => {
    const repo = new InventoryItemRepo(db);
    await repo.softDelete(seed.bpc.id);
    const row = await db.inventoryItems.get(seed.bpc.id);
    expect(row?.deletedAt).toBeDefined();
    const outbox = await db.outbox.where('entity').equals('inventoryItem').toArray();
    expect(outbox.find((o) => o.op === 'delete')).toBeDefined();
  });

  it('getById hides soft-deleted rows', async () => {
    const repo = new InventoryItemRepo(db);
    await repo.softDelete(seed.bpc.id);
    expect(await repo.getById(seed.bpc.id)).toBeUndefined();
  });

  it('listForHousehold filters tombstones and other households', async () => {
    const repo = new InventoryItemRepo(db);
    const otherHousehold = newId();
    await db.inventoryItems.put({
      ...seed.bpc,
      id: newId(),
      householdId: otherHousehold,
    });
    const list = await repo.listForHousehold(seed.household.id);
    expect(list.length).toBe(1);
    expect(list[0]?.householdId).toBe(seed.household.id);
  });
});

describe('InventoryBatchRepo', () => {
  it('listForItem returns only batches for the requested item+household', async () => {
    const repo = new InventoryBatchRepo(db);
    const otherItem = newId();
    await db.inventoryBatches.put({
      ...seed.batch,
      id: newId(),
      itemId: otherItem,
    });
    const list = await repo.listForItem(seed.household.id, seed.bpc.id);
    expect(list.length).toBe(1);
    expect(list[0]?.itemId).toBe(seed.bpc.id);
  });
});

describe('ProtocolRepo + ProtocolItemRepo', () => {
  it('lists active protocols per user; ProtocolItem repo is keyed by protocolId', async () => {
    const protoRepo = new ProtocolRepo(db);
    const itemRepo = new ProtocolItemRepo(db);

    const protocol: Protocol = {
      id: newId(),
      householdId: seed.household.id,
      userId: seed.alex.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 0,
      name: 'Healing stack',
      active: true,
      startDate: '2026-04-30',
    };
    await protoRepo.upsert(protocol);

    const item: ProtocolItem = {
      id: newId(),
      protocolId: protocol.id,
      itemId: seed.bpc.id,
      doseAmount: 250,
      doseUnit: 'mcg',
      method: 'subq',
      rrule: 'FREQ=DAILY',
      timezone: 'America/New_York',
      localStartTime: '08:00',
    };
    await itemRepo.upsert(item);

    const active = await protoRepo.listActiveForUser(seed.household.id, seed.alex.id);
    expect(active.length).toBe(1);
    const items = await itemRepo.listForProtocol(protocol.id);
    expect(items.length).toBe(1);
    expect(items[0]?.timezone).toBe('America/New_York');
  });
});

describe('UserProfileRepo lifecycle', () => {
  it('inactive after soft-delete', async () => {
    const repo = new UserProfileRepo(db);
    await repo.softDelete(seed.wife.id);
    const list = await repo.listForHousehold(seed.household.id);
    expect(list.find((u) => u.id === seed.wife.id)).toBeUndefined();
    expect(list.find((u) => u.id === seed.alex.id)).toBeDefined();
  });
});
