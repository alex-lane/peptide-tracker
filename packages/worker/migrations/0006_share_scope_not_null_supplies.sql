-- A0.3 — tighten share_scope + creator_user_id to NOT NULL on
-- supply_items. See 0004_share_scope_not_null_items.sql for the
-- rationale (per-table split for D1 timeout safety).

CREATE TABLE supply_items_new (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  item_id TEXT NOT NULL,
  remaining_count INTEGER NOT NULL,
  threshold_low_count INTEGER,
  notes_md TEXT,
  creator_user_id TEXT NOT NULL,
  share_scope TEXT NOT NULL
);

INSERT INTO supply_items_new
SELECT
  id, household_id, created_at, updated_at, version, deleted_at,
  item_id, remaining_count, threshold_low_count, notes_md,
  creator_user_id, share_scope
FROM supply_items;

DROP TABLE supply_items;
ALTER TABLE supply_items_new RENAME TO supply_items;

CREATE INDEX supply_items_by_updated ON supply_items (household_id, updated_at);
CREATE INDEX supply_items_by_creator ON supply_items (household_id, creator_user_id);
