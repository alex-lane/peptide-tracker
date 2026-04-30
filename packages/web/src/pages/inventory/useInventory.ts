import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/db';
import type { InventoryBatch, InventoryItem } from '@/db';

export interface InventoryRow {
  item: InventoryItem;
  batches: InventoryBatch[];
  activeBatch: InventoryBatch | null;
}

const ACTIVE_STATUSES: ReadonlyArray<InventoryBatch['status']> = [
  'in_use',
  'reconstituted',
  'sealed',
];

/**
 * Live query: items + their non-deleted batches for the active household.
 * `activeBatch` is the first batch in (in_use → reconstituted → sealed)
 * order, ignoring empty / discarded / expired.
 */
export function useInventory(householdId: string | null): InventoryRow[] {
  const rows = useLiveQuery(
    async () => {
      if (!householdId) return [];
      const db = getDb();
      const items = (await db.inventoryItems.where('householdId').equals(householdId).toArray())
        .filter((i) => !i.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name));
      const batches = (
        await db.inventoryBatches.where('householdId').equals(householdId).toArray()
      ).filter((b) => !b.deletedAt);
      return items.map<InventoryRow>((item) => {
        const itemBatches = batches.filter((b) => b.itemId === item.id);
        const activeBatch = pickActiveBatch(itemBatches);
        return { item, batches: itemBatches, activeBatch };
      });
    },
    [householdId],
    [],
  );
  return rows ?? [];
}

function pickActiveBatch(batches: InventoryBatch[]): InventoryBatch | null {
  for (const status of ACTIVE_STATUSES) {
    const match = batches.find((b) => b.status === status);
    if (match) return match;
  }
  return null;
}
