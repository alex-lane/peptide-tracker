import { z } from 'zod';
import {
  calendarEventMapping,
  calendarExportHistory,
  calendarFeedSettings,
  customMetric,
  doseLog,
  doseSchedule,
  educationContent,
  household,
  inventoryAdjustment,
  inventoryBatch,
  inventoryItem,
  metricLog,
  protocol,
  protocolItem,
  supplyItem,
  userProfile,
} from '@peptide/domain';
import type { PeptideDb } from './schema.js';
import { sha256Hex } from './sha256.js';

export const EXPORT_VERSION = 1 as const;
export const EXPORT_MAGIC = 'peptide-tracker.export.v1' as const;

/**
 * The on-disk JSON shape. Keys are ordered alphabetically by canonical
 * serialization so the SHA-256 of the same data produces the same digest
 * across browsers / runtimes.
 */
export const exportSchema = z
  .object({
    magic: z.literal(EXPORT_MAGIC),
    version: z.literal(EXPORT_VERSION),
    exportedAt: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    households: z.array(household).default([]),
    userProfiles: z.array(userProfile).default([]),
    inventoryItems: z.array(inventoryItem).default([]),
    inventoryBatches: z.array(inventoryBatch).default([]),
    supplyItems: z.array(supplyItem).default([]),
    protocols: z.array(protocol).default([]),
    protocolItems: z.array(protocolItem).default([]),
    doseSchedules: z.array(doseSchedule).default([]),
    doseLogs: z.array(doseLog).default([]),
    inventoryAdjustments: z.array(inventoryAdjustment).default([]),
    customMetrics: z.array(customMetric).default([]),
    metricLogs: z.array(metricLog).default([]),
    calendarFeedSettings: z.array(calendarFeedSettings).default([]),
    calendarEventMappings: z.array(calendarEventMapping).default([]),
    calendarExportHistory: z.array(calendarExportHistory).default([]),
    educationContent: z.array(educationContent).default([]),
  })
  .strict();

export type ExportPayload = z.infer<typeof exportSchema>;

/**
 * Stable, key-sorted serialization. The hash is computed over the body
 * with a placeholder hash field, then re-inserted — that guarantees
 * round-trip stability.
 */
export async function exportToJson(db: PeptideDb): Promise<string> {
  const body = await collectAll(db);
  const placeholder: ExportPayload = {
    magic: EXPORT_MAGIC,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sha256: '0'.repeat(64),
    ...body,
  };
  const canonical = canonicalJson({ ...placeholder, sha256: '' });
  const sha = await sha256Hex(canonical);
  const final: ExportPayload = { ...placeholder, sha256: sha };
  return canonicalJson(final);
}

export type ImportMode = 'replace' | 'merge_by_id' | 'merge_by_id_take_newer';

export interface ImportResult {
  /** Per-table count of rows that were INSERTED or UPDATED. */
  written: Record<string, number>;
  /** Per-table count of rows skipped (already-newer-on-disk under merge_by_id_take_newer). */
  skipped: Record<string, number>;
}

export async function importFromJson(
  db: PeptideDb,
  raw: string,
  mode: ImportMode,
): Promise<ImportResult> {
  const parsed = JSON.parse(raw) as unknown;
  const data = exportSchema.parse(parsed);

  // Verify hash. We rebuild the canonical form with the hash blanked and
  // recompute. If it doesn't match, something tampered or the hash is stale.
  const expected = data.sha256;
  const verify = canonicalJson({ ...data, sha256: '' });
  const got = await sha256Hex(verify);
  if (got !== expected) {
    throw new Error(
      `peptide-tracker import: SHA-256 mismatch (got ${got}, expected ${expected}). File may be corrupt or modified.`,
    );
  }

  const written: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const tables: ReadonlyArray<readonly [keyof ExportPayload, keyof PeptideDb]> = [
    ['households', 'households'],
    ['userProfiles', 'userProfiles'],
    ['inventoryItems', 'inventoryItems'],
    ['inventoryBatches', 'inventoryBatches'],
    ['supplyItems', 'supplyItems'],
    ['protocols', 'protocols'],
    ['protocolItems', 'protocolItems'],
    ['doseSchedules', 'doseSchedules'],
    ['doseLogs', 'doseLogs'],
    ['inventoryAdjustments', 'inventoryAdjustments'],
    ['customMetrics', 'customMetrics'],
    ['metricLogs', 'metricLogs'],
    ['calendarFeedSettings', 'calendarFeedSettings'],
    ['calendarEventMappings', 'calendarEventMappings'],
    ['calendarExportHistory', 'calendarExportHistory'],
    ['educationContent', 'educationContent'],
  ];

  await db.transaction(
    'rw',
    [
      db.households,
      db.userProfiles,
      db.inventoryItems,
      db.inventoryBatches,
      db.supplyItems,
      db.protocols,
      db.protocolItems,
      db.doseSchedules,
      db.doseLogs,
      db.inventoryAdjustments,
      db.customMetrics,
      db.metricLogs,
      db.calendarFeedSettings,
      db.calendarEventMappings,
      db.calendarExportHistory,
      db.educationContent,
    ],
    async () => {
      if (mode === 'replace') {
        for (const [, dbKey] of tables) {
          await (db[dbKey] as unknown as { clear(): Promise<void> }).clear();
        }
      }

      for (const [bodyKey, dbKey] of tables) {
        const rows = data[bodyKey] as Array<{ id: string; updatedAt?: string }>;
        const table = db[dbKey] as unknown as {
          get(id: string): Promise<{ updatedAt?: string } | undefined>;
          put(row: unknown): Promise<unknown>;
        };
        let w = 0;
        let s = 0;
        for (const row of rows) {
          if (mode === 'merge_by_id_take_newer') {
            const existing = await table.get(row.id);
            if (existing?.updatedAt && row.updatedAt && existing.updatedAt >= row.updatedAt) {
              s++;
              continue;
            }
          }
          await table.put(row);
          w++;
        }
        written[bodyKey] = w;
        skipped[bodyKey] = s;
      }
    },
  );

  return { written, skipped };
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function collectAll(
  db: PeptideDb,
): Promise<Omit<ExportPayload, 'magic' | 'version' | 'exportedAt' | 'sha256'>> {
  const [
    households,
    userProfiles,
    inventoryItems,
    inventoryBatches,
    supplyItems,
    protocols,
    protocolItems,
    doseSchedules,
    doseLogs,
    inventoryAdjustments,
    customMetrics,
    metricLogs,
    calendarFeedSettings,
    calendarEventMappings,
    calendarExportHistory,
    educationContent,
  ] = await Promise.all([
    db.households.toArray(),
    db.userProfiles.toArray(),
    db.inventoryItems.toArray(),
    db.inventoryBatches.toArray(),
    db.supplyItems.toArray(),
    db.protocols.toArray(),
    db.protocolItems.toArray(),
    db.doseSchedules.toArray(),
    db.doseLogs.toArray(),
    db.inventoryAdjustments.toArray(),
    db.customMetrics.toArray(),
    db.metricLogs.toArray(),
    db.calendarFeedSettings.toArray(),
    db.calendarEventMappings.toArray(),
    db.calendarExportHistory.toArray(),
    db.educationContent.toArray(),
  ]);
  return {
    households,
    userProfiles,
    inventoryItems,
    inventoryBatches,
    supplyItems,
    protocols,
    protocolItems,
    doseSchedules,
    doseLogs,
    inventoryAdjustments,
    customMetrics,
    metricLogs,
    calendarFeedSettings,
    calendarEventMappings,
    calendarExportHistory,
    educationContent,
  };
}

/**
 * Stable JSON: object keys are sorted, arrays preserve order, undefined
 * values are dropped. The output is line-broken with 2-space indentation
 * for human-readability.
 */
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

