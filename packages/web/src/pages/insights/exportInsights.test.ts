import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { makeTestDb, seedHousehold, type TestSeed } from '@/db/test-helpers';
import { DoseLogRepo, type PeptideDb } from '@/db';
import { newId, nowIso } from '@/db';
import {
  buildUserDoseLogsCsv,
  buildUserJsonExport,
  buildUserMetricLogsCsv,
} from './exportInsights';
import { createMetric, logMetric } from './customMetrics';

let db: PeptideDb;
let seed: TestSeed;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
  seed = await seedHousehold(db);
});

afterEach(() => {
  db.close();
});

describe('buildUserDoseLogsCsv', () => {
  it('emits header + one row per non-deleted log, sorted by takenAt', async () => {
    const repo = new DoseLogRepo(db);
    await repo.create({
      log: {
        id: newId(),
        householdId: seed.household.id,
        userId: seed.alex.id,
        itemId: seed.bpc.id,
        doseAmount: 250,
        doseUnit: 'mcg',
        method: 'subq',
        takenAt: '2026-04-02T08:00:00.000Z',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        version: 0,
      },
    });
    await repo.create({
      log: {
        id: newId(),
        householdId: seed.household.id,
        userId: seed.alex.id,
        itemId: seed.bpc.id,
        doseAmount: 250,
        doseUnit: 'mcg',
        method: 'subq',
        takenAt: '2026-04-01T08:00:00.000Z',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        version: 0,
      },
    });
    const csv = await buildUserDoseLogsCsv({
      db,
      householdId: seed.household.id,
      userId: seed.alex.id,
    });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('taken_at,item_name');
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[1]).toContain('2026-04-01');
    expect(lines[2]).toContain('2026-04-02');
  });

  it('quotes fields containing commas or newlines', async () => {
    const repo = new DoseLogRepo(db);
    await repo.create({
      log: {
        id: newId(),
        householdId: seed.household.id,
        userId: seed.alex.id,
        itemId: seed.bpc.id,
        doseAmount: 250,
        doseUnit: 'mcg',
        method: 'subq',
        takenAt: '2026-04-01T08:00:00.000Z',
        notesMd: 'felt fine, no issues',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        version: 0,
      },
    });
    const csv = await buildUserDoseLogsCsv({
      db,
      householdId: seed.household.id,
      userId: seed.alex.id,
    });
    expect(csv).toContain('"felt fine, no issues"');
  });

  it('excludes other users from the export', async () => {
    const repo = new DoseLogRepo(db);
    await repo.create({
      log: {
        id: newId(),
        householdId: seed.household.id,
        userId: seed.wife.id, // not Alex
        itemId: seed.bpc.id,
        doseAmount: 250,
        doseUnit: 'mcg',
        method: 'subq',
        takenAt: '2026-04-01T08:00:00.000Z',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        version: 0,
      },
    });
    const csv = await buildUserDoseLogsCsv({
      db,
      householdId: seed.household.id,
      userId: seed.alex.id,
    });
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1); // header only
  });
});

describe('buildUserMetricLogsCsv', () => {
  it('emits header + one row per metric log', async () => {
    const sleep = await createMetric(db, {
      householdId: seed.household.id,
      userId: seed.alex.id,
      name: 'Sleep score',
      unit: '/10',
      type: 'scale_1_10',
    });
    await logMetric(db, {
      householdId: seed.household.id,
      userId: seed.alex.id,
      metricId: sleep.id,
      value: 8,
      recordedAt: '2026-04-01T08:00:00.000Z',
    });
    const csv = await buildUserMetricLogsCsv({
      db,
      householdId: seed.household.id,
      userId: seed.alex.id,
    });
    expect(csv).toContain('recorded_at,metric_name');
    expect(csv).toContain('Sleep score');
    expect(csv).toContain(',8,');
  });
});

describe('buildUserJsonExport', () => {
  it('round-trips dose logs + metrics + metric logs for the user only', async () => {
    const sleep = await createMetric(db, {
      householdId: seed.household.id,
      userId: seed.alex.id,
      name: 'Sleep',
      type: 'number',
    });
    await logMetric(db, {
      householdId: seed.household.id,
      userId: seed.alex.id,
      metricId: sleep.id,
      value: 7.5,
      recordedAt: '2026-04-01T08:00:00.000Z',
    });
    const out = await buildUserJsonExport({
      db,
      householdId: seed.household.id,
      userId: seed.alex.id,
    });
    expect(out.version).toBe(1);
    expect(out.userId).toBe(seed.alex.id);
    expect(out.customMetrics).toHaveLength(1);
    expect(out.metricLogs).toHaveLength(1);
    expect(out.metricLogs[0]?.value).toBe(7.5);
  });
});
