-- A0.1 — backfill share_scope and creator_user_id for existing inventory rows.
--
-- share_scope: every legacy row gets 'household' to preserve current
-- visibility (everyone in the household sees the item, just like before
-- A0). New rows from A0.3 explicitly default to 'private' at the
-- application layer.
--
-- creator_user_id: pick one user per legacy household once (the
-- earliest-created user_profile in that household), assign every
-- existing inventory_item to that user, then cascade inventory_batches
-- and supply_items from their parent item.
--
-- Households with zero user_profiles cannot be backfilled here. They
-- remain NULL; A0.3's NOT NULL constraint phase (0004) asserts there
-- are no remaining NULLs and aborts the migration if any are found,
-- which forces the operator to repair (manually attach a user, or
-- remove the orphaned household).

UPDATE inventory_items   SET share_scope = 'household' WHERE share_scope IS NULL;
UPDATE inventory_batches SET share_scope = 'household' WHERE share_scope IS NULL;
UPDATE supply_items      SET share_scope = 'household' WHERE share_scope IS NULL;

UPDATE inventory_items
SET creator_user_id = (
  SELECT id
  FROM user_profiles
  WHERE user_profiles.household_id = inventory_items.household_id
    AND user_profiles.deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE creator_user_id IS NULL;

UPDATE inventory_batches
SET creator_user_id = (
  SELECT creator_user_id
  FROM inventory_items
  WHERE inventory_items.id = inventory_batches.item_id
)
WHERE creator_user_id IS NULL;

UPDATE supply_items
SET creator_user_id = (
  SELECT creator_user_id
  FROM inventory_items
  WHERE inventory_items.id = supply_items.item_id
)
WHERE creator_user_id IS NULL;
