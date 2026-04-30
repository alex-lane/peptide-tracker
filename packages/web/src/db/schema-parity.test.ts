import { describe, expect, it } from 'vitest';
import { schemaByEntity } from '@peptide/domain';
import { makeTestDb } from './test-helpers.js';

/**
 * Parity invariant: every Zod entity in @peptide/domain has a Dexie table
 * named the corresponding camelCase plural (with the canonical pluralization
 * map below). If this drifts, sync will silently drop fields. Per the
 * autoplan eng review (#30): schema parity is enforced in CI.
 */
const PLURAL_MAP: Record<string, string> = {
  household: 'households',
  userProfile: 'userProfiles',
  inventoryItem: 'inventoryItems',
  inventoryBatch: 'inventoryBatches',
  supplyItem: 'supplyItems',
  protocol: 'protocols',
  protocolItem: 'protocolItems',
  doseSchedule: 'doseSchedules',
  doseLog: 'doseLogs',
  inventoryAdjustment: 'inventoryAdjustments',
  customMetric: 'customMetrics',
  metricLog: 'metricLogs',
  calendarFeedSettings: 'calendarFeedSettings',
  calendarEventMapping: 'calendarEventMappings',
  calendarExportHistory: 'calendarExportHistory',
  educationContent: 'educationContent',
};

describe('schema parity (Zod ↔ Dexie)', () => {
  it('every domain entity has a Dexie table', async () => {
    const db = makeTestDb();
    await db.open();
    const tableNames = new Set(db.tables.map((t) => t.name));

    for (const entityName of Object.keys(schemaByEntity)) {
      const expectedTable = PLURAL_MAP[entityName];
      expect(expectedTable, `No plural mapping for ${entityName}`).toBeDefined();
      expect(tableNames, `Missing Dexie table ${expectedTable}`).toContain(expectedTable);
    }

    db.close();
  });

  it('Dexie has no extra household-scoped tables beyond the entity set + outbox', async () => {
    const db = makeTestDb();
    await db.open();
    const tableNames = db.tables.map((t) => t.name);
    const expected = new Set([...Object.values(PLURAL_MAP), 'outbox']);
    for (const name of tableNames) {
      expect(expected, `Unexpected table ${name}`).toContain(name);
    }
    db.close();
  });
});
