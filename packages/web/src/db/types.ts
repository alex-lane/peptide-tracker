// Re-export the canonical entity types from the domain package. The Dexie
// schema mirrors these field names verbatim — that mirror is asserted by
// db/schema-parity.test.ts.

export type {
  Household,
  UserProfile,
  InventoryItem,
  InventoryBatch,
  ReconstitutionRecord,
  SupplyItem,
  Protocol,
  ProtocolItem,
  DoseSchedule,
  DoseLog,
  InventoryAdjustment,
  CustomMetric,
  MetricLog,
  CalendarFeedSettings,
  CalendarEventMapping,
  CalendarExportHistory,
  EducationContent,
  SyncEntityName,
} from '@peptide/domain';

// ─── Outbox row (Dexie-only — not a domain entity) ────────────────────

export interface OutboxRow {
  /** Local-only auto-increment surrogate; ordering is FIFO by this. */
  id?: number;
  /**
   * Idempotency key (UUID). Same value goes to the Worker, which dedupes
   * by (household_id, mutationId) on /sync/push.
   */
  mutationId: string;
  entity:
    | 'household'
    | 'userProfile'
    | 'inventoryItem'
    | 'inventoryBatch'
    | 'supplyItem'
    | 'protocol'
    | 'protocolItem'
    | 'doseSchedule'
    | 'doseLog'
    | 'inventoryAdjustment'
    | 'customMetric'
    | 'metricLog'
    | 'calendarFeedSettings'
    | 'calendarEventMapping'
    | 'calendarExportHistory'
    | 'educationContent';
  op: 'upsert' | 'delete' | 'compensate';
  /** The full row (for upsert) or { id } (for delete) — JSON-serializable. */
  payload: unknown;
  createdAt: string; // ISO datetime
  retryCount: number;
  lastError: string | null;
  ackedAt: string | null;
}
