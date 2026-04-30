// Drizzle schema mirrors @peptide/domain Zod entities verbatim. Field names
// MUST match the domain schemas — the schema-parity Worker test asserts this.

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ─── Helpers ──────────────────────────────────────────────────────────

const baseColumns = {
  id: text('id').primaryKey().notNull(),
  householdId: text('household_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: integer('version').notNull().default(0),
  deletedAt: text('deleted_at'),
};

// ─── Households + UserProfile ─────────────────────────────────────────

export const households = sqliteTable(
  'households',
  {
    ...baseColumns,
    name: text('name').notNull(),
    settingsJson: text('settings_json').notNull(),
  },
  (t) => ({
    byUpdated: index('households_by_updated').on(t.householdId, t.updatedAt),
  }),
);

export const userProfiles = sqliteTable(
  'user_profiles',
  {
    ...baseColumns,
    displayName: text('display_name').notNull(),
    color: text('color').notNull(),
    avatarEmoji: text('avatar_emoji'),
  },
  (t) => ({
    byUpdated: index('user_profiles_by_updated').on(t.householdId, t.updatedAt),
  }),
);

// ─── Inventory ────────────────────────────────────────────────────────

export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    ...baseColumns,
    name: text('name').notNull(),
    form: text('form').notNull(),
    defaultStrengthJson: text('default_strength_json'),
    defaultUnitOfDose: text('default_unit_of_dose'),
    vendor: text('vendor'),
    notesMd: text('notes_md'),
    iconEmoji: text('icon_emoji'),
    colorTag: text('color_tag'),
  },
  (t) => ({
    byUpdated: index('inventory_items_by_updated').on(t.householdId, t.updatedAt),
  }),
);

export const inventoryBatches = sqliteTable(
  'inventory_batches',
  {
    ...baseColumns,
    itemId: text('item_id').notNull(),
    lotNumber: text('lot_number'),
    purchasedAt: text('purchased_at'),
    purchasePrice: real('purchase_price'),
    storageLocation: text('storage_location'),
    expiresAt: text('expires_at'),
    initialQuantity: real('initial_quantity').notNull(),
    initialQuantityUnit: text('initial_quantity_unit').notNull(),
    remainingQuantity: real('remaining_quantity').notNull(),
    status: text('status').notNull(),
    reconstitutionJson: text('reconstitution_json'),
    notesMd: text('notes_md'),
  },
  (t) => ({
    byUpdated: index('inventory_batches_by_updated').on(t.householdId, t.updatedAt),
    byItem: index('inventory_batches_by_item').on(t.householdId, t.itemId),
  }),
);

export const supplyItems = sqliteTable(
  'supply_items',
  {
    ...baseColumns,
    itemId: text('item_id').notNull(),
    remainingCount: integer('remaining_count').notNull(),
    thresholdLowCount: integer('threshold_low_count'),
    notesMd: text('notes_md'),
  },
  (t) => ({
    byUpdated: index('supply_items_by_updated').on(t.householdId, t.updatedAt),
  }),
);

// ─── Protocols + scheduling ───────────────────────────────────────────

export const protocols = sqliteTable(
  'protocols',
  {
    ...baseColumns,
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    active: integer('active', { mode: 'boolean' }).notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
  },
  (t) => ({
    byUserUpdated: index('protocols_by_user_updated').on(t.householdId, t.userId, t.updatedAt),
  }),
);

export const protocolItems = sqliteTable('protocol_items', {
  id: text('id').primaryKey().notNull(),
  protocolId: text('protocol_id').notNull(),
  itemId: text('item_id').notNull(),
  doseAmount: real('dose_amount').notNull(),
  doseUnit: text('dose_unit').notNull(),
  method: text('method').notNull(),
  rrule: text('rrule').notNull(),
  timezone: text('timezone').notNull(),
  localStartTime: text('local_start_time').notNull(),
  cycleJson: text('cycle_json'),
  preferredBatchId: text('preferred_batch_id'),
  notesMd: text('notes_md'),
});

export const doseSchedules = sqliteTable(
  'dose_schedules',
  {
    ...baseColumns,
    userId: text('user_id').notNull(),
    protocolItemId: text('protocol_item_id'),
    itemId: text('item_id').notNull(),
    scheduledFor: text('scheduled_for').notNull(),
    doseAmount: real('dose_amount').notNull(),
    doseUnit: text('dose_unit').notNull(),
    method: text('method').notNull(),
    status: text('status').notNull(),
    doseLogId: text('dose_log_id'),
  },
  (t) => ({
    byUserScheduled: index('dose_schedules_by_user_scheduled').on(
      t.householdId,
      t.userId,
      t.scheduledFor,
    ),
    byScheduled: index('dose_schedules_by_scheduled').on(t.householdId, t.scheduledFor),
  }),
);

// ─── Logs + adjustments ───────────────────────────────────────────────

export const doseLogs = sqliteTable(
  'dose_logs',
  {
    ...baseColumns,
    userId: text('user_id').notNull(),
    itemId: text('item_id').notNull(),
    batchId: text('batch_id'),
    doseAmount: real('dose_amount').notNull(),
    doseUnit: text('dose_unit').notNull(),
    method: text('method').notNull(),
    injectionSite: text('injection_site'),
    takenAt: text('taken_at').notNull(),
    notesMd: text('notes_md'),
    sideEffectsJson: text('side_effects_json'),
    tagsJson: text('tags_json'),
    scheduleId: text('schedule_id'),
    protocolId: text('protocol_id'),
  },
  (t) => ({
    byUserTaken: index('dose_logs_by_user_taken').on(t.householdId, t.userId, t.takenAt),
    byTaken: index('dose_logs_by_taken').on(t.householdId, t.takenAt),
  }),
);

export const inventoryAdjustments = sqliteTable(
  'inventory_adjustments',
  {
    id: text('id').primaryKey().notNull(),
    householdId: text('household_id').notNull(),
    batchId: text('batch_id').notNull(),
    delta: real('delta').notNull(),
    unit: text('unit').notNull(),
    reason: text('reason').notNull(),
    refDoseLogId: text('ref_dose_log_id'),
    mutationId: text('mutation_id').notNull(),
    byUserId: text('by_user_id').notNull(),
    notesMd: text('notes_md'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byBatchCreated: index('inventory_adjustments_by_batch_created').on(
      t.householdId,
      t.batchId,
      t.createdAt,
    ),
    byMutation: uniqueIndex('inventory_adjustments_by_mutation').on(t.householdId, t.mutationId),
  }),
);

// ─── Custom metrics ───────────────────────────────────────────────────

export const customMetrics = sqliteTable(
  'custom_metrics',
  {
    ...baseColumns,
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    unit: text('unit'),
    type: text('type').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull(),
  },
  (t) => ({
    byUser: index('custom_metrics_by_user').on(t.householdId, t.userId),
  }),
);

export const metricLogs = sqliteTable(
  'metric_logs',
  {
    id: text('id').primaryKey().notNull(),
    householdId: text('household_id').notNull(),
    userId: text('user_id').notNull(),
    metricId: text('metric_id').notNull(),
    valueJson: text('value_json').notNull(),
    recordedAt: text('recorded_at').notNull(),
    notesMd: text('notes_md'),
  },
  (t) => ({
    byUserRecorded: index('metric_logs_by_user_recorded').on(t.householdId, t.userId, t.recordedAt),
  }),
);

// ─── Calendar ─────────────────────────────────────────────────────────

export const calendarFeedSettings = sqliteTable(
  'calendar_feed_settings',
  {
    id: text('id').primaryKey().notNull(),
    householdId: text('household_id').notNull(),
    scope: text('scope').notNull(),
    userId: text('user_id'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    privacy: text('privacy').notNull(),
    includeDose: integer('include_dose', { mode: 'boolean' }).notNull(),
    includeProtocolName: integer('include_protocol_name', { mode: 'boolean' }).notNull(),
    includeProductName: integer('include_product_name', { mode: 'boolean' }).notNull(),
    includeReminders: integer('include_reminders', { mode: 'boolean' }).notNull(),
    reminderMinutesBeforeJson: text('reminder_minutes_before_json'),
    feedToken: text('feed_token'),
    feedTokenIssuedAt: text('feed_token_issued_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    byScope: index('calendar_feed_settings_by_scope').on(t.householdId, t.scope, t.userId),
  }),
);

export const calendarEventMappings = sqliteTable('calendar_event_mappings', {
  id: text('id').primaryKey().notNull(),
  householdId: text('household_id').notNull(),
  scheduleId: text('schedule_id'),
  protocolItemId: text('protocol_item_id'),
  uid: text('uid').notNull(),
  lastExportedSummary: text('last_exported_summary'),
  lastExportedAt: text('last_exported_at'),
});

export const calendarExportHistory = sqliteTable(
  'calendar_export_history',
  {
    id: text('id').primaryKey().notNull(),
    householdId: text('household_id').notNull(),
    exportedAt: text('exported_at').notNull(),
    scope: text('scope').notNull(),
    userId: text('user_id'),
    privacy: text('privacy').notNull(),
    eventCount: integer('event_count').notNull(),
    sha256: text('sha256').notNull(),
  },
  (t) => ({
    byExported: index('calendar_export_history_by_exported').on(t.householdId, t.exportedAt),
  }),
);

// ─── Education content ────────────────────────────────────────────────

export const educationContent = sqliteTable(
  'education_content',
  {
    id: text('id').primaryKey().notNull(),
    slug: text('slug').notNull(),
    householdId: text('household_id'),
    name: text('name').notNull(),
    productClass: text('product_class'),
    mechanismMd: text('mechanism_md'),
    halfLifeText: text('half_life_text'),
    routeText: text('route_text'),
    sideEffectsJson: text('side_effects_json'),
    citationsJson: text('citations_json'),
    regulatoryNoteMd: text('regulatory_note_md'),
    lastUpdated: text('last_updated').notNull(),
  },
  (t) => ({
    bySlug: uniqueIndex('education_content_by_slug').on(t.slug),
    byHouseholdSlug: index('education_content_by_household_slug').on(t.householdId, t.slug),
  }),
);

// ─── Sync infrastructure ──────────────────────────────────────────────

/**
 * Idempotency table. Every accepted /sync/push mutation lands here keyed
 * by (householdId, mutationId) — replays return the same canonical
 * response without re-applying the write. Per autoplan eng review #23.
 */
export const processedMutations = sqliteTable(
  'processed_mutations',
  {
    householdId: text('household_id').notNull(),
    mutationId: text('mutation_id').notNull(),
    entity: text('entity').notNull(),
    op: text('op').notNull(),
    /** JSON-encoded canonical response payload (the row as-applied). */
    responseJson: text('response_json').notNull(),
    appliedAt: text('applied_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.householdId, t.mutationId] }),
    byApplied: index('processed_mutations_by_applied').on(t.householdId, t.appliedAt),
  }),
);

/**
 * Cloudflare Access maps users by email; the JWT exposes `email` and
 * `aud`. We map email → (userId, householdId) via this table. v1
 * household-beta: a single human enters this row manually after creating
 * their household; v1.5 consumer signup will populate it via Clerk.
 */
export const accessUsers = sqliteTable(
  'access_users',
  {
    email: text('email').primaryKey().notNull(),
    userId: text('user_id').notNull(),
    householdId: text('household_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byHousehold: index('access_users_by_household').on(t.householdId),
  }),
);

// Re-export sql for the routes layer to use in raw expressions when needed.
export { sql };
