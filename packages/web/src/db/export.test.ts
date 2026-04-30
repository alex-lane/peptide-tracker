import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportToJson, importFromJson } from './export.js';
import { makeTestDb, seedHousehold, type TestSeed } from './test-helpers.js';
import { DoseLogRepo } from './repos/dose-log.js';
import { newId, nowIso } from './ids.js';
import type { PeptideDb } from './schema.js';
import type { DoseLog } from './types.js';

let db: PeptideDb;
let seed: TestSeed;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
  seed = await seedHousehold(db);
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

describe('JSON export / import', () => {
  it('exports → imports → identical content (replace mode)', async () => {
    await new DoseLogRepo(db).create({
      log: buildLog(),
      adjustment: { batchId: seed.batch.id, delta: -0.1, unit: 'mL', reason: 'dose_log' },
    });
    const before = await snapshot(db);
    const json = await exportToJson(db);

    const fresh = makeTestDb();
    await fresh.open();
    const result = await importFromJson(fresh, json, 'replace');

    expect(result.written['households']).toBe(1);
    expect(result.written['doseLogs']).toBe(1);

    const after = await snapshot(fresh);
    expect(after).toEqual(before);
    fresh.close();
  });

  it('SHA-256 mismatch is rejected at import time', async () => {
    const json = await exportToJson(db);
    const tampered = JSON.parse(json) as { households: Array<{ name: string }> };
    tampered.households[0]!.name = 'Tampered';
    const fresh = makeTestDb();
    await fresh.open();
    await expect(importFromJson(fresh, JSON.stringify(tampered), 'replace')).rejects.toThrow(
      /SHA-256 mismatch/,
    );
    fresh.close();
  });

  it('merge_by_id_take_newer keeps disk row when it is newer', async () => {
    // Local DB has wife.displayName = 'Wife' (set at seed)
    // Imported JSON will contain an OLDER copy of wife with displayName = 'Old'.
    const oldUpdate = '2020-01-01T00:00:00.000Z';
    const exported = JSON.parse(await exportToJson(db)) as {
      userProfiles: Array<{ id: string; displayName: string; updatedAt: string }>;
      sha256: string;
    };
    const wifeIdx = exported.userProfiles.findIndex((u) => u.id === seed.wife.id);
    exported.userProfiles[wifeIdx]!.displayName = 'Old';
    exported.userProfiles[wifeIdx]!.updatedAt = oldUpdate;

    // Recompute hash for the tampered-but-legitimate file.
    const rehashed = await rehash(exported);

    const result = await importFromJson(db, rehashed, 'merge_by_id_take_newer');
    expect(result.skipped['userProfiles']).toBe(2); // both users skipped (existing rows newer)

    const wife = await db.userProfiles.get(seed.wife.id);
    expect(wife?.displayName).toBe('Wife'); // not 'Old'
  });

  it('merge_by_id overwrites unconditionally', async () => {
    const exported = JSON.parse(await exportToJson(db)) as {
      userProfiles: Array<{ id: string; displayName: string }>;
      sha256: string;
    };
    const wifeIdx = exported.userProfiles.findIndex((u) => u.id === seed.wife.id);
    exported.userProfiles[wifeIdx]!.displayName = 'OverwrittenWife';
    const rehashed = await rehash(exported);

    await importFromJson(db, rehashed, 'merge_by_id');
    const wife = await db.userProfiles.get(seed.wife.id);
    expect(wife?.displayName).toBe('OverwrittenWife');
  });

  it('rejects a payload with extra keys (Zod strict)', async () => {
    const exported = JSON.parse(await exportToJson(db)) as Record<string, unknown>;
    exported['unexpected_key'] = 'oops';
    const rehashed = await rehash(exported);
    await expect(importFromJson(db, rehashed, 'replace')).rejects.toThrow();
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────

async function snapshot(db: PeptideDb): Promise<Record<string, unknown[]>> {
  return {
    households: await db.households.toArray(),
    userProfiles: await db.userProfiles.toArray(),
    inventoryItems: await db.inventoryItems.toArray(),
    inventoryBatches: await db.inventoryBatches.toArray(),
    doseLogs: await db.doseLogs.toArray(),
    inventoryAdjustments: await db.inventoryAdjustments.toArray(),
  };
}

/** Recompute the SHA-256 of a payload after editing fields. */
async function rehash(payload: Record<string, unknown>): Promise<string> {
  const blanked = { ...payload, sha256: '' };
  const canonical = canonicalJson(blanked);
  const sha = await sha256Hex(canonical);
  return canonicalJson({ ...payload, sha256: sha });
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
