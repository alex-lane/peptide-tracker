-- A0.1 — share-scope columns, nullable phase.
-- Adds creator_user_id and share_scope (both nullable) to inventory_items,
-- inventory_batches, supply_items. Both columns nullable in this phase so
-- existing INSERT OR REPLACE paths in withTenant.upsertWithOcc do not
-- break before A0.2 teaches the server to stamp these fields. Old rows
-- read back as `shareScope: undefined` which the application treats as
-- 'household' (preserves current visibility). A0.3's 0004 migration adds
-- the NOT NULL constraint after backfill is complete and the UI ships.

ALTER TABLE inventory_items   ADD COLUMN creator_user_id TEXT;
ALTER TABLE inventory_items   ADD COLUMN share_scope     TEXT;

ALTER TABLE inventory_batches ADD COLUMN creator_user_id TEXT;
ALTER TABLE inventory_batches ADD COLUMN share_scope     TEXT;

ALTER TABLE supply_items      ADD COLUMN creator_user_id TEXT;
ALTER TABLE supply_items      ADD COLUMN share_scope     TEXT;

-- Composite indexes that A0.2's withTenant queries will use when applying
-- the (creator = me OR share_scope = 'household') filter.
CREATE INDEX inventory_items_by_creator   ON inventory_items   (household_id, creator_user_id);
CREATE INDEX inventory_batches_by_creator ON inventory_batches (household_id, creator_user_id);
CREATE INDEX supply_items_by_creator      ON supply_items      (household_id, creator_user_id);
