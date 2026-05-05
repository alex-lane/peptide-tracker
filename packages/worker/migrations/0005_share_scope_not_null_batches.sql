-- A0.3 — tighten share_scope + creator_user_id to NOT NULL on
-- inventory_batches. See 0004_share_scope_not_null_items.sql for the
-- rationale (per-table split for D1 timeout safety).

CREATE TABLE inventory_batches_new (
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
  notes_md TEXT,
  creator_user_id TEXT NOT NULL,
  share_scope TEXT NOT NULL
);

INSERT INTO inventory_batches_new
SELECT
  id, household_id, created_at, updated_at, version, deleted_at,
  item_id, lot_number, purchased_at, purchase_price, storage_location,
  expires_at, initial_quantity, initial_quantity_unit,
  remaining_quantity, status, reconstitution_json, notes_md,
  creator_user_id, share_scope
FROM inventory_batches;

DROP TABLE inventory_batches;
ALTER TABLE inventory_batches_new RENAME TO inventory_batches;

CREATE INDEX inventory_batches_by_updated ON inventory_batches (household_id, updated_at);
CREATE INDEX inventory_batches_by_item    ON inventory_batches (household_id, item_id);
CREATE INDEX inventory_batches_by_creator ON inventory_batches (household_id, creator_user_id);
