import Dexie, { type EntityTable } from 'dexie';
import type {
  CalendarEventMapping,
  CalendarExportHistory,
  CalendarFeedSettings,
  CustomMetric,
  DoseLog,
  DoseSchedule,
  EducationContent,
  Household,
  InventoryAdjustment,
  InventoryBatch,
  InventoryItem,
  MetricLog,
  OutboxRow,
  Protocol,
  ProtocolItem,
  SupplyItem,
  UserProfile,
} from './types.js';

export const DB_NAME = 'peptide-tracker';
export const DB_VERSION = 1;

/**
 * Compound indexes in Dexie use comma-separated strings inside square
 * brackets. We index on (householdId, *) for every household-scoped table
 * to mirror the D1 indexes specified in the autoplan eng review.
 */
export class PeptideDb extends Dexie {
  households!: EntityTable<Household, 'id'>;
  userProfiles!: EntityTable<UserProfile, 'id'>;
  inventoryItems!: EntityTable<InventoryItem, 'id'>;
  inventoryBatches!: EntityTable<InventoryBatch, 'id'>;
  supplyItems!: EntityTable<SupplyItem, 'id'>;
  protocols!: EntityTable<Protocol, 'id'>;
  protocolItems!: EntityTable<ProtocolItem, 'id'>;
  doseSchedules!: EntityTable<DoseSchedule, 'id'>;
  doseLogs!: EntityTable<DoseLog, 'id'>;
  inventoryAdjustments!: EntityTable<InventoryAdjustment, 'id'>;
  customMetrics!: EntityTable<CustomMetric, 'id'>;
  metricLogs!: EntityTable<MetricLog, 'id'>;
  calendarFeedSettings!: EntityTable<CalendarFeedSettings, 'id'>;
  calendarEventMappings!: EntityTable<CalendarEventMapping, 'id'>;
  calendarExportHistory!: EntityTable<CalendarExportHistory, 'id'>;
  educationContent!: EntityTable<EducationContent, 'id'>;
  outbox!: EntityTable<OutboxRow, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(DB_VERSION).stores({
      households: 'id, [householdId+updatedAt], deletedAt',
      userProfiles: 'id, [householdId+updatedAt], deletedAt',
      inventoryItems: 'id, householdId, [householdId+updatedAt], deletedAt, form',
      inventoryBatches:
        'id, householdId, itemId, [householdId+updatedAt], [householdId+itemId], deletedAt, status, expiresAt',
      supplyItems: 'id, householdId, itemId, [householdId+updatedAt], deletedAt',
      protocols:
        'id, householdId, userId, [householdId+userId], [householdId+updatedAt], deletedAt',
      protocolItems: 'id, protocolId, itemId',
      doseSchedules:
        'id, householdId, userId, itemId, scheduledFor, status, [householdId+userId+scheduledFor], [householdId+scheduledFor], deletedAt',
      doseLogs:
        'id, householdId, userId, itemId, batchId, takenAt, [householdId+userId+takenAt], [householdId+takenAt], deletedAt',
      inventoryAdjustments:
        'id, householdId, batchId, mutationId, [householdId+batchId+createdAt], [householdId+mutationId]',
      customMetrics: 'id, householdId, userId, [householdId+userId], deletedAt',
      metricLogs: 'id, householdId, userId, metricId, recordedAt, [householdId+userId+recordedAt]',
      calendarFeedSettings: 'id, householdId, scope, userId, [householdId+scope+userId]',
      calendarEventMappings: 'id, householdId, scheduleId, protocolItemId, uid',
      calendarExportHistory: 'id, householdId, exportedAt, [householdId+exportedAt]',
      educationContent: 'id, &slug, householdId, [householdId+slug]',
      outbox: '++id, mutationId, entity, createdAt, ackedAt',
    });
  }
}

/** Singleton browser-side instance. Tests construct their own via `new PeptideDb('test-' + n)`. */
let _db: PeptideDb | null = null;

export function getDb(): PeptideDb {
  if (!_db) _db = new PeptideDb();
  return _db;
}

/** Test-only — reset the singleton between tests. */
export function _resetDbSingleton(): void {
  _db = null;
}
