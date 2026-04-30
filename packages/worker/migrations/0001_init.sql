-- peptide-tracker D1 schema v1
-- Field names mirror @peptide/domain Zod entities. Schema parity is asserted
-- in worker tests; do not drift one side without the other.

CREATE TABLE households (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  name TEXT NOT NULL,
  settings_json TEXT NOT NULL
);
CREATE INDEX households_by_updated ON households (household_id, updated_at);

CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,
  avatar_emoji TEXT
);
CREATE INDEX user_profiles_by_updated ON user_profiles (household_id, updated_at);

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  name TEXT NOT NULL,
  form TEXT NOT NULL,
  default_strength_json TEXT,
  default_unit_of_dose TEXT,
  vendor TEXT,
  notes_md TEXT,
  icon_emoji TEXT,
  color_tag TEXT
);
CREATE INDEX inventory_items_by_updated ON inventory_items (household_id, updated_at);

CREATE TABLE inventory_batches (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  item_id TEXT NOT NULL,
  lot_number TEXT,
  purchased_at TEXT,
  purchase_price REAL,
  storage_location TEXT,
  expires_at TEXT,
  initial_quantity REAL NOT NULL,
  initial_quantity_unit TEXT NOT NULL,
  remaining_quantity REAL NOT NULL,
  status TEXT NOT NULL,
  reconstitution_json TEXT,
  notes_md TEXT
);
CREATE INDEX inventory_batches_by_updated ON inventory_batches (household_id, updated_at);
CREATE INDEX inventory_batches_by_item ON inventory_batches (household_id, item_id);

CREATE TABLE supply_items (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  item_id TEXT NOT NULL,
  remaining_count INTEGER NOT NULL,
  threshold_low_count INTEGER,
  notes_md TEXT
);
CREATE INDEX supply_items_by_updated ON supply_items (household_id, updated_at);

CREATE TABLE protocols (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT
);
CREATE INDEX protocols_by_user_updated ON protocols (household_id, user_id, updated_at);

CREATE TABLE protocol_items (
  id TEXT PRIMARY KEY NOT NULL,
  protocol_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  dose_amount REAL NOT NULL,
  dose_unit TEXT NOT NULL,
  method TEXT NOT NULL,
  rrule TEXT NOT NULL,
  timezone TEXT NOT NULL,
  local_start_time TEXT NOT NULL,
  cycle_json TEXT,
  preferred_batch_id TEXT,
  notes_md TEXT
);
CREATE INDEX protocol_items_by_protocol ON protocol_items (protocol_id);

CREATE TABLE dose_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  user_id TEXT NOT NULL,
  protocol_item_id TEXT,
  item_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  dose_amount REAL NOT NULL,
  dose_unit TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  dose_log_id TEXT
);
CREATE INDEX dose_schedules_by_user_scheduled
  ON dose_schedules (household_id, user_id, scheduled_for);
CREATE INDEX dose_schedules_by_scheduled ON dose_schedules (household_id, scheduled_for);

CREATE TABLE dose_logs (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  batch_id TEXT,
  dose_amount REAL NOT NULL,
  dose_unit TEXT NOT NULL,
  method TEXT NOT NULL,
  injection_site TEXT,
  taken_at TEXT NOT NULL,
  notes_md TEXT,
  side_effects_json TEXT,
  tags_json TEXT,
  schedule_id TEXT,
  protocol_id TEXT
);
CREATE INDEX dose_logs_by_user_taken ON dose_logs (household_id, user_id, taken_at);
CREATE INDEX dose_logs_by_taken ON dose_logs (household_id, taken_at);

CREATE TABLE inventory_adjustments (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  delta REAL NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  ref_dose_log_id TEXT,
  mutation_id TEXT NOT NULL,
  by_user_id TEXT NOT NULL,
  notes_md TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX inventory_adjustments_by_batch_created
  ON inventory_adjustments (household_id, batch_id, created_at);
CREATE UNIQUE INDEX inventory_adjustments_by_mutation
  ON inventory_adjustments (household_id, mutation_id);

CREATE TABLE custom_metrics (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  type TEXT NOT NULL,
  archived INTEGER NOT NULL
);
CREATE INDEX custom_metrics_by_user ON custom_metrics (household_id, user_id);

CREATE TABLE metric_logs (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  notes_md TEXT
);
CREATE INDEX metric_logs_by_user_recorded ON metric_logs (household_id, user_id, recorded_at);

CREATE TABLE calendar_feed_settings (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  user_id TEXT,
  enabled INTEGER NOT NULL,
  privacy TEXT NOT NULL,
  include_dose INTEGER NOT NULL,
  include_protocol_name INTEGER NOT NULL,
  include_product_name INTEGER NOT NULL,
  include_reminders INTEGER NOT NULL,
  reminder_minutes_before_json TEXT,
  feed_token TEXT,
  feed_token_issued_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX calendar_feed_settings_by_scope
  ON calendar_feed_settings (household_id, scope, user_id);

CREATE TABLE calendar_event_mappings (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  schedule_id TEXT,
  protocol_item_id TEXT,
  uid TEXT NOT NULL,
  last_exported_summary TEXT,
  last_exported_at TEXT
);

CREATE TABLE calendar_export_history (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  user_id TEXT,
  privacy TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE INDEX calendar_export_history_by_exported
  ON calendar_export_history (household_id, exported_at);

CREATE TABLE education_content (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  household_id TEXT,
  name TEXT NOT NULL,
  product_class TEXT,
  mechanism_md TEXT,
  half_life_text TEXT,
  route_text TEXT,
  side_effects_json TEXT,
  citations_json TEXT,
  regulatory_note_md TEXT,
  last_updated TEXT NOT NULL
);
CREATE UNIQUE INDEX education_content_by_slug ON education_content (slug);
CREATE INDEX education_content_by_household_slug ON education_content (household_id, slug);

-- Sync infrastructure ----------------------------------------------------

CREATE TABLE processed_mutations (
  household_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  op TEXT NOT NULL,
  response_json TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (household_id, mutation_id)
);
CREATE INDEX processed_mutations_by_applied
  ON processed_mutations (household_id, applied_at);

CREATE TABLE access_users (
  email TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX access_users_by_household ON access_users (household_id);
