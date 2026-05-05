-- A0.3 — tighten share_scope + creator_user_id to NOT NULL on inventory_items.
--
-- SQLite cannot ALTER COLUMN to add NOT NULL in place. Pattern: rebuild
-- the table with the new constraint, copy data, drop the old, rename.
-- Split into one migration per table (this file + two siblings) so each
-- script stays well under D1's 30s per-statement-batch timeout. The
-- 0002 nullable phase already timed out on a 9-statement batch in this
-- repo, so per-table splits are a real precaution, not theatre.
--
-- Pre-flight assertion: by the time this migration runs, A0.1's 0003
-- backfill plus A0.2's server-side stamping should have populated every
-- existing row. If a NULL still exists (e.g., orphan household with no
-- user_profiles), this CREATE TABLE … SELECT will fail with a NOT NULL
-- violation and the migration aborts. That's the desired behavior — it
-- forces the operator to repair instead of silently flipping the schema.

CREATE TABLE inventory_items_new (
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
  color_tag TEXT,
  creator_user_id TEXT NOT NULL,
  share_scope TEXT NOT NULL
);

INSERT INTO inventory_items_new
SELECT
  id, household_id, created_at, updated_at, version, deleted_at,
  name, form, default_strength_json, default_unit_of_dose, vendor,
  notes_md, icon_emoji, color_tag, creator_user_id, share_scope
FROM inventory_items;

DROP TABLE inventory_items;
ALTER TABLE inventory_items_new RENAME TO inventory_items;

CREATE INDEX inventory_items_by_updated ON inventory_items (household_id, updated_at);
CREATE INDEX inventory_items_by_creator ON inventory_items (household_id, creator_user_id);
