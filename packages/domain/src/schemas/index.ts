import { z } from 'zod';
import { baseEntity, ianaTimeZone, id, isoDate, isoDateTime } from './common.js';

export * from './common.js';

// ─── Enumerations ─────────────────────────────────────────────────────

export const massUnit = z.enum(['mcg', 'mg', 'g', 'IU']);
export type MassUnitT = z.infer<typeof massUnit>;

export const doseUnit = z.enum([
  'mcg',
  'mg',
  'g',
  'IU',
  'mL',
  'units',
  'capsules',
  'tablets',
  'drops',
  'sprays',
]);
export type DoseUnitT = z.infer<typeof doseUnit>;

export const productForm = z.enum([
  'injectable_lyophilized',
  'injectable_solution',
  'capsule',
  'tablet',
  'powder_oral',
  'spray_nasal',
  'spray_oral',
  'drops_oral',
  'drops_eye',
  'topical_cream',
  'topical_patch',
  'supply',
]);
export type ProductFormT = z.infer<typeof productForm>;

export const administrationMethod = z.enum([
  'subq',
  'im',
  'iv',
  'oral',
  'sublingual',
  'nasal',
  'topical',
  'inhaled',
  'other',
]);
export type AdministrationMethodT = z.infer<typeof administrationMethod>;

export const injectionSite = z.enum([
  'abd_ul',
  'abd_ur',
  'abd_ll',
  'abd_lr',
  'thigh_l',
  'thigh_r',
  'glute_l',
  'glute_r',
  'delt_l',
  'delt_r',
  'other',
]);
export type InjectionSiteT = z.infer<typeof injectionSite>;

export const batchStatus = z.enum([
  'sealed',
  'reconstituted',
  'in_use',
  'empty',
  'discarded',
  'expired',
]);
export type BatchStatusT = z.infer<typeof batchStatus>;

export const scheduleStatus = z.enum(['pending', 'logged', 'skipped', 'missed']);
export type ScheduleStatusT = z.infer<typeof scheduleStatus>;

export const calendarPrivacy = z.enum(['full', 'generic', 'minimal']);
export type CalendarPrivacyT = z.infer<typeof calendarPrivacy>;

export const adjustmentReason = z.enum([
  'dose_log',
  'reconstitution',
  'discard',
  'manual_correction',
  'spillage',
  'gift',
]);
export type AdjustmentReasonT = z.infer<typeof adjustmentReason>;

// ─── Household + UserProfile ──────────────────────────────────────────

export const household = baseEntity.extend({
  name: z.string().min(1),
  settings: z.object({
    defaultPrivacy: calendarPrivacy.default('generic'),
    units: z.object({
      mass: z.enum(['mcg', 'mg']).default('mcg'),
      volume: z.literal('mL').default('mL'),
      insulin: z.literal('units').default('units'),
    }),
  }),
});
export type Household = z.infer<typeof household>;

export const userProfile = baseEntity.extend({
  displayName: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be #RRGGBB hex'),
  avatarEmoji: z.string().max(8).optional(),
});
export type UserProfile = z.infer<typeof userProfile>;

// ─── Inventory ────────────────────────────────────────────────────────

export const shareScope = z.enum(['private', 'household']);
export type ShareScopeT = z.infer<typeof shareScope>;

export const inventoryItem = baseEntity.extend({
  name: z.string().min(1).max(120),
  form: productForm,
  defaultStrength: z
    .object({
      value: z.number().positive(),
      unit: massUnit,
    })
    .optional(),
  defaultUnitOfDose: doseUnit.optional(),
  vendor: z.string().max(120).optional(),
  notesMd: z.string().max(20_000).optional(),
  iconEmoji: z.string().max(8).optional(),
  colorTag: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** Member who created this item. Optional in the wire format so old
   * clients can still push; the server stamps from the JWT principal
   * on insert (A0.2) and the storage layer enforces NOT NULL via
   * migrations 0004-0006. After backfill + server stamping, every
   * row read back from the server has this field populated. */
  creatorUserId: id.optional(),
  /** Visibility within the household. Optional in the wire format for
   * the same reason. New items from A0.3 UI default to 'private';
   * legacy rows backfilled to 'household' in 0003 to preserve
   * current behavior. */
  shareScope: shareScope.optional(),
});
export type InventoryItem = z.infer<typeof inventoryItem>;

export const reconstitutionRecord = z.object({
  reconstitutedAt: isoDateTime,
  diluentVolumeMl: z.number().positive(),
  diluentType: z.enum(['bac_water', 'sterile_water', 'other']),
  resultingConcentration: z.object({
    value: z.number().positive(),
    unit: massUnit,
    perMl: z.literal(true),
  }),
  discardByAt: isoDateTime.optional(),
  byUserId: id,
  notesMd: z.string().max(5000).optional(),
});
export type ReconstitutionRecord = z.infer<typeof reconstitutionRecord>;

export const batchQuantityUnit = z.enum([
  'mg',
  'mcg',
  'mL',
  'capsules',
  'tablets',
  'sprays',
  'drops',
  'g',
]);
export type BatchQuantityUnitT = z.infer<typeof batchQuantityUnit>;

export const inventoryBatch = baseEntity.extend({
  itemId: id,
  lotNumber: z.string().max(80).optional(),
  purchasedAt: isoDateTime.optional(),
  purchasePrice: z.number().nonnegative().optional(),
  storageLocation: z.string().max(120).optional(),
  expiresAt: isoDateTime.optional(),
  initialQuantity: z.number().positive(),
  initialQuantityUnit: batchQuantityUnit,
  /** Cached projection — authoritative source is the ledger of adjustments. */
  remainingQuantity: z.number().nonnegative(),
  status: batchStatus,
  reconstitution: reconstitutionRecord.optional(),
  notesMd: z.string().max(20_000).optional(),
  /** Cascaded from the parent inventory item; child rows inherit so reads
   * can filter by share scope without joining the item table. Optional
   * in the wire format for backward compatibility (server stamps). */
  creatorUserId: id.optional(),
  shareScope: shareScope.optional(),
});
export type InventoryBatch = z.infer<typeof inventoryBatch>;

export const supplyItem = baseEntity.extend({
  itemId: id,
  remainingCount: z.number().int().nonnegative(),
  thresholdLowCount: z.number().int().nonnegative().optional(),
  notesMd: z.string().max(5000).optional(),
  /** Cascaded from the parent inventory item. Optional in wire format. */
  creatorUserId: id.optional(),
  shareScope: shareScope.optional(),
});
export type SupplyItem = z.infer<typeof supplyItem>;

// ─── Protocols + scheduling ──────────────────────────────────────────

export const protocol = baseEntity.extend({
  userId: id,
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  active: z.boolean(),
  startDate: isoDate,
  endDate: isoDate.optional(),
});
export type Protocol = z.infer<typeof protocol>;

export const protocolItem = z.object({
  id,
  protocolId: id,
  itemId: id,
  doseAmount: z.number().positive(),
  doseUnit,
  method: administrationMethod,
  rrule: z.string().min(1).max(500),
  /** IANA timezone — recurring schedules MUST carry their authoring TZ
   *  per the autoplan eng review. Expansion uses (rrule, tzid, localTime). */
  timezone: ianaTimeZone,
  /** Local-wall-time start (HH:mm) within `timezone`. */
  localStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm'),
  cycle: z
    .object({
      onDays: z.number().int().positive(),
      offDays: z.number().int().nonnegative(),
    })
    .optional(),
  preferredBatchId: id.optional(),
  notesMd: z.string().max(5000).optional(),
});
export type ProtocolItem = z.infer<typeof protocolItem>;

export const doseSchedule = baseEntity.extend({
  userId: id,
  protocolItemId: id.optional(),
  itemId: id,
  scheduledFor: isoDateTime,
  doseAmount: z.number().positive(),
  doseUnit,
  method: administrationMethod,
  status: scheduleStatus,
  doseLogId: id.optional(),
});
export type DoseSchedule = z.infer<typeof doseSchedule>;

// ─── Logs + adjustments ──────────────────────────────────────────────

export const doseLog = baseEntity.extend({
  userId: id,
  itemId: id,
  batchId: id.optional(),
  doseAmount: z.number().positive(),
  doseUnit,
  method: administrationMethod,
  injectionSite: injectionSite.optional(),
  takenAt: isoDateTime,
  notesMd: z.string().max(20_000).optional(),
  sideEffects: z.array(z.string().max(120)).max(20).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  scheduleId: id.optional(),
  protocolId: id.optional(),
});
export type DoseLog = z.infer<typeof doseLog>;

export const inventoryAdjustment = z.object({
  id,
  householdId: id,
  batchId: id,
  delta: z.number().refine((n) => Number.isFinite(n) && n !== 0, 'Delta must be non-zero finite'),
  unit: batchQuantityUnit,
  reason: adjustmentReason,
  refDoseLogId: id.optional(),
  /** Idempotency key (autoplan eng review #23). Repeats are ignored server-side. */
  mutationId: id,
  byUserId: id,
  notesMd: z.string().max(5000).optional(),
  createdAt: isoDateTime,
});
export type InventoryAdjustment = z.infer<typeof inventoryAdjustment>;

// ─── Custom metrics ──────────────────────────────────────────────────

export const customMetric = baseEntity.extend({
  userId: id,
  name: z.string().min(1).max(80),
  unit: z.string().max(20).optional(),
  type: z.enum(['number', 'scale_1_10', 'boolean', 'text']),
  archived: z.boolean(),
});
export type CustomMetric = z.infer<typeof customMetric>;

export const metricLog = z.object({
  id,
  householdId: id,
  userId: id,
  metricId: id,
  value: z.union([z.number(), z.boolean(), z.string().max(2000)]),
  recordedAt: isoDateTime,
  notesMd: z.string().max(5000).optional(),
});
export type MetricLog = z.infer<typeof metricLog>;

// ─── Calendar ────────────────────────────────────────────────────────

export const calendarFeedSettings = z.object({
  id,
  householdId: id,
  scope: z.enum(['household', 'user']),
  userId: id.optional(),
  enabled: z.boolean(),
  privacy: calendarPrivacy,
  includeDose: z.boolean(),
  includeProtocolName: z.boolean(),
  includeProductName: z.boolean(),
  includeReminders: z.boolean(),
  reminderMinutesBefore: z.array(z.number().int().nonnegative()).max(8).optional(),
  feedToken: z.string().max(200).optional(),
  feedTokenIssuedAt: isoDateTime.optional(),
  updatedAt: isoDateTime,
});
export type CalendarFeedSettings = z.infer<typeof calendarFeedSettings>;

export const calendarEventMapping = z.object({
  id,
  householdId: id,
  scheduleId: id.optional(),
  protocolItemId: id.optional(),
  uid: z.string().min(1).max(200),
  lastExportedSummary: z.string().max(200).optional(),
  lastExportedAt: isoDateTime.optional(),
});
export type CalendarEventMapping = z.infer<typeof calendarEventMapping>;

export const calendarExportHistory = z.object({
  id,
  householdId: id,
  exportedAt: isoDateTime,
  scope: z.enum(['household', 'user']),
  userId: id.optional(),
  privacy: calendarPrivacy,
  eventCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type CalendarExportHistory = z.infer<typeof calendarExportHistory>;

// ─── Education content (per autoplan premise gate) ────────────────────

export const educationContent = z.object({
  id,
  /** Slug acts as the natural key (e.g., "bpc-157"). */
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Must be lowercase-kebab'),
  /** Optional household scope; null/undefined = global seed content. */
  householdId: id.optional(),
  name: z.string().min(1).max(120),
  productClass: z.string().max(120).optional(),
  /** Markdown body — sanitized at render time. NEVER raw HTML. */
  mechanismMd: z.string().max(10_000).optional(),
  /** Free-text containing only direct quotations from cited studies. The lint
   *  rule (M5) enforces "no curated dose ranges"; this field stores the
   *  reference text verbatim. */
  halfLifeText: z.string().max(2000).optional(),
  routeText: z.string().max(2000).optional(),
  sideEffects: z.array(z.string().max(200)).max(40).optional(),
  citations: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        url: z.string().url(),
      }),
    )
    .max(40)
    .optional(),
  regulatoryNoteMd: z.string().max(2000).optional(),
  lastUpdated: isoDateTime,
});
export type EducationContent = z.infer<typeof educationContent>;

// ─── Discriminated union for sync push payloads (used in M3) ──────────

export const syncEntityName = z.enum([
  'household',
  'userProfile',
  'inventoryItem',
  'inventoryBatch',
  'supplyItem',
  'protocol',
  'protocolItem',
  'doseSchedule',
  'doseLog',
  'inventoryAdjustment',
  'customMetric',
  'metricLog',
  'calendarFeedSettings',
  'calendarEventMapping',
  'calendarExportHistory',
  'educationContent',
]);
export type SyncEntityName = z.infer<typeof syncEntityName>;

/** Mapping from entity name → schema. Useful for codegen + runtime validation. */
export const schemaByEntity = {
  household,
  userProfile,
  inventoryItem,
  inventoryBatch,
  supplyItem,
  protocol,
  protocolItem,
  doseSchedule,
  doseLog,
  inventoryAdjustment,
  customMetric,
  metricLog,
  calendarFeedSettings,
  calendarEventMapping,
  calendarExportHistory,
  educationContent,
} as const;
