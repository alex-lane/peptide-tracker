// Single source of truth for the entity-name → table-name + column-list
// mapping used by /sync/pull and /sync/push. The Worker never builds
// arbitrary SQL — every read and write goes through a row-shape we own,
// which means no SQL injection surface and no possibility of forgetting
// the household_id filter on a route.

import type { SyncEntityName } from '@peptide/domain';

export interface TableSpec {
  /** SQL table name. */
  table: string;
  /** Whether the table carries a `household_id` column. */
  hasHousehold: boolean;
  /** Whether the table participates in the LWW + version sync model. */
  isSynced: boolean;
  /**
   * Map from camelCase domain field → snake_case SQL column. This drives
   * BOTH directions of serialization (row → JSON for /sync/pull, JSON →
   * row for /sync/push).
   */
  columns: Readonly<Record<string, string>>;
  /** Field names whose values are JSON-encoded at rest (TEXT in SQLite). */
  jsonFields: ReadonlySet<string>;
  /** Boolean fields stored as INTEGER 0/1. */
  boolFields: ReadonlySet<string>;
}

/** Common base columns for every household-scoped synced entity. */
const BASE_COLS = {
  id: 'id',
  householdId: 'household_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  version: 'version',
  deletedAt: 'deleted_at',
} as const;

export const TABLES: Readonly<Record<SyncEntityName, TableSpec>> = {
  household: {
    table: 'households',
    hasHousehold: true,
    isSynced: true,
    columns: { ...BASE_COLS, name: 'name', settings: 'settings_json' },
    jsonFields: new Set(['settings']),
    boolFields: new Set(),
  },
  userProfile: {
    table: 'user_profiles',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      displayName: 'display_name',
      color: 'color',
      avatarEmoji: 'avatar_emoji',
    },
    jsonFields: new Set(),
    boolFields: new Set(),
  },
  inventoryItem: {
    table: 'inventory_items',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      name: 'name',
      form: 'form',
      defaultStrength: 'default_strength_json',
      defaultUnitOfDose: 'default_unit_of_dose',
      vendor: 'vendor',
      notesMd: 'notes_md',
      iconEmoji: 'icon_emoji',
      colorTag: 'color_tag',
      creatorUserId: 'creator_user_id',
      shareScope: 'share_scope',
    },
    jsonFields: new Set(['defaultStrength']),
    boolFields: new Set(),
  },
  inventoryBatch: {
    table: 'inventory_batches',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      itemId: 'item_id',
      lotNumber: 'lot_number',
      purchasedAt: 'purchased_at',
      purchasePrice: 'purchase_price',
      storageLocation: 'storage_location',
      expiresAt: 'expires_at',
      initialQuantity: 'initial_quantity',
      initialQuantityUnit: 'initial_quantity_unit',
      remainingQuantity: 'remaining_quantity',
      status: 'status',
      reconstitution: 'reconstitution_json',
      notesMd: 'notes_md',
      creatorUserId: 'creator_user_id',
      shareScope: 'share_scope',
    },
    jsonFields: new Set(['reconstitution']),
    boolFields: new Set(),
  },
  supplyItem: {
    table: 'supply_items',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      itemId: 'item_id',
      remainingCount: 'remaining_count',
      thresholdLowCount: 'threshold_low_count',
      notesMd: 'notes_md',
      creatorUserId: 'creator_user_id',
      shareScope: 'share_scope',
    },
    jsonFields: new Set(),
    boolFields: new Set(),
  },
  protocol: {
    table: 'protocols',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      userId: 'user_id',
      name: 'name',
      description: 'description',
      active: 'active',
      startDate: 'start_date',
      endDate: 'end_date',
    },
    jsonFields: new Set(),
    boolFields: new Set(['active']),
  },
  protocolItem: {
    table: 'protocol_items',
    hasHousehold: false, // child of protocol
    isSynced: false,
    columns: {
      id: 'id',
      protocolId: 'protocol_id',
      itemId: 'item_id',
      doseAmount: 'dose_amount',
      doseUnit: 'dose_unit',
      method: 'method',
      rrule: 'rrule',
      timezone: 'timezone',
      localStartTime: 'local_start_time',
      cycle: 'cycle_json',
      preferredBatchId: 'preferred_batch_id',
      notesMd: 'notes_md',
    },
    jsonFields: new Set(['cycle']),
    boolFields: new Set(),
  },
  doseSchedule: {
    table: 'dose_schedules',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      userId: 'user_id',
      protocolItemId: 'protocol_item_id',
      itemId: 'item_id',
      scheduledFor: 'scheduled_for',
      doseAmount: 'dose_amount',
      doseUnit: 'dose_unit',
      method: 'method',
      status: 'status',
      doseLogId: 'dose_log_id',
    },
    jsonFields: new Set(),
    boolFields: new Set(),
  },
  doseLog: {
    table: 'dose_logs',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      userId: 'user_id',
      itemId: 'item_id',
      batchId: 'batch_id',
      doseAmount: 'dose_amount',
      doseUnit: 'dose_unit',
      method: 'method',
      injectionSite: 'injection_site',
      takenAt: 'taken_at',
      notesMd: 'notes_md',
      sideEffects: 'side_effects_json',
      tags: 'tags_json',
      scheduleId: 'schedule_id',
      protocolId: 'protocol_id',
    },
    jsonFields: new Set(['sideEffects', 'tags']),
    boolFields: new Set(),
  },
  inventoryAdjustment: {
    table: 'inventory_adjustments',
    hasHousehold: true,
    isSynced: false, // append-only, no version/updatedAt/deletedAt
    columns: {
      id: 'id',
      householdId: 'household_id',
      batchId: 'batch_id',
      delta: 'delta',
      unit: 'unit',
      reason: 'reason',
      refDoseLogId: 'ref_dose_log_id',
      mutationId: 'mutation_id',
      byUserId: 'by_user_id',
      notesMd: 'notes_md',
      createdAt: 'created_at',
    },
    jsonFields: new Set(),
    boolFields: new Set(),
  },
  customMetric: {
    table: 'custom_metrics',
    hasHousehold: true,
    isSynced: true,
    columns: {
      ...BASE_COLS,
      userId: 'user_id',
      name: 'name',
      unit: 'unit',
      type: 'type',
      archived: 'archived',
    },
    jsonFields: new Set(),
    boolFields: new Set(['archived']),
  },
  metricLog: {
    table: 'metric_logs',
    hasHousehold: true,
    isSynced: false,
    columns: {
      id: 'id',
      householdId: 'household_id',
      userId: 'user_id',
      metricId: 'metric_id',
      value: 'value_json',
      recordedAt: 'recorded_at',
      notesMd: 'notes_md',
    },
    jsonFields: new Set(['value']),
    boolFields: new Set(),
  },
  calendarFeedSettings: {
    table: 'calendar_feed_settings',
    hasHousehold: true,
    isSynced: false,
    columns: {
      id: 'id',
      householdId: 'household_id',
      scope: 'scope',
      userId: 'user_id',
      enabled: 'enabled',
      privacy: 'privacy',
      includeDose: 'include_dose',
      includeProtocolName: 'include_protocol_name',
      includeProductName: 'include_product_name',
      includeReminders: 'include_reminders',
      reminderMinutesBefore: 'reminder_minutes_before_json',
      feedToken: 'feed_token',
      feedTokenIssuedAt: 'feed_token_issued_at',
      updatedAt: 'updated_at',
    },
    jsonFields: new Set(['reminderMinutesBefore']),
    boolFields: new Set([
      'enabled',
      'includeDose',
      'includeProtocolName',
      'includeProductName',
      'includeReminders',
    ]),
  },
  calendarEventMapping: {
    table: 'calendar_event_mappings',
    hasHousehold: true,
    isSynced: false,
    columns: {
      id: 'id',
      householdId: 'household_id',
      scheduleId: 'schedule_id',
      protocolItemId: 'protocol_item_id',
      uid: 'uid',
      lastExportedSummary: 'last_exported_summary',
      lastExportedAt: 'last_exported_at',
    },
    jsonFields: new Set(),
    boolFields: new Set(),
  },
  calendarExportHistory: {
    table: 'calendar_export_history',
    hasHousehold: true,
    isSynced: false,
    columns: {
      id: 'id',
      householdId: 'household_id',
      exportedAt: 'exported_at',
      scope: 'scope',
      userId: 'user_id',
      privacy: 'privacy',
      eventCount: 'event_count',
      sha256: 'sha256',
    },
    jsonFields: new Set(),
    boolFields: new Set(),
  },
  educationContent: {
    table: 'education_content',
    hasHousehold: true, // optional; null means global content
    isSynced: false,
    columns: {
      id: 'id',
      slug: 'slug',
      householdId: 'household_id',
      name: 'name',
      productClass: 'product_class',
      mechanismMd: 'mechanism_md',
      halfLifeText: 'half_life_text',
      routeText: 'route_text',
      sideEffects: 'side_effects_json',
      citations: 'citations_json',
      regulatoryNoteMd: 'regulatory_note_md',
      lastUpdated: 'last_updated',
    },
    jsonFields: new Set(['sideEffects', 'citations']),
    boolFields: new Set(),
  },
};

export type EntityName = SyncEntityName;
