import type { Table } from 'dexie';
import type { SyncEntityName } from '@peptide/domain';
import type { PeptideDb } from '../db/schema.js';
import type { SyncTransport } from './transport.js';
import { readCursor, writeCursor } from './config.js';

export interface PullResult {
  /** True when the transport is in no-op mode (workerUrl unset). */
  skipped: boolean;
  /** Per-entity count of rows merged into Dexie. */
  merged: Record<string, number>;
  /** Per-entity count of incoming rows that were skipped (older than disk). */
  skippedRows: Record<string, number>;
  /** New cursor after the pull. */
  cursor: string | null;
}

/**
 * Pull from the Worker and merge each entity into Dexie. Last-write-wins
 * by `updatedAt` — incoming rows older than the local copy are ignored.
 * Soft-deleted rows arrive with `deletedAt` set; the merge keeps the
 * tombstone so the UI can hide them.
 */
export async function pullAndMerge(
  db: PeptideDb,
  transport: SyncTransport,
  options: { force?: boolean; entities?: SyncEntityName[] } = {},
): Promise<PullResult> {
  const cursor = options.force ? null : await readCursor(db);
  const result: PullResult = {
    skipped: false,
    merged: {},
    skippedRows: {},
    cursor,
  };

  const response = await transport.pull(cursor, options.entities);
  if (response === null) {
    result.skipped = true;
    return result;
  }

  for (const [entityName, rows] of Object.entries(response.entities)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const table = tableFor(db, entityName as SyncEntityName);
    if (!table) continue;
    let merged = 0;
    let skippedRows = 0;
    await db.transaction('rw', table, async () => {
      for (const row of rows) {
        const id = (row as { id?: string }).id;
        if (!id) continue;
        const incomingUpdatedAt = (row as { updatedAt?: string }).updatedAt;
        if (incomingUpdatedAt) {
          const existing = await (table as Table<{ updatedAt?: string }>).get(id as never);
          if (existing?.updatedAt && existing.updatedAt >= incomingUpdatedAt) {
            skippedRows += 1;
            continue;
          }
        }
        await (table as Table<unknown>).put(row);
        merged += 1;
      }
    });
    result.merged[entityName] = merged;
    result.skippedRows[entityName] = skippedRows;
  }

  await writeCursor(db, response.cursor);
  result.cursor = response.cursor;
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function tableFor(db: PeptideDb, entity: SyncEntityName): Table<unknown> | null {
  switch (entity) {
    case 'household':
      return db.households as unknown as Table<unknown>;
    case 'userProfile':
      return db.userProfiles as unknown as Table<unknown>;
    case 'inventoryItem':
      return db.inventoryItems as unknown as Table<unknown>;
    case 'inventoryBatch':
      return db.inventoryBatches as unknown as Table<unknown>;
    case 'supplyItem':
      return db.supplyItems as unknown as Table<unknown>;
    case 'protocol':
      return db.protocols as unknown as Table<unknown>;
    case 'protocolItem':
      return db.protocolItems as unknown as Table<unknown>;
    case 'doseSchedule':
      return db.doseSchedules as unknown as Table<unknown>;
    case 'doseLog':
      return db.doseLogs as unknown as Table<unknown>;
    case 'inventoryAdjustment':
      return db.inventoryAdjustments as unknown as Table<unknown>;
    case 'customMetric':
      return db.customMetrics as unknown as Table<unknown>;
    case 'metricLog':
      return db.metricLogs as unknown as Table<unknown>;
    case 'calendarFeedSettings':
      return db.calendarFeedSettings as unknown as Table<unknown>;
    case 'calendarEventMapping':
      return db.calendarEventMappings as unknown as Table<unknown>;
    case 'calendarExportHistory':
      return db.calendarExportHistory as unknown as Table<unknown>;
    case 'educationContent':
      return db.educationContent as unknown as Table<unknown>;
  }
}
