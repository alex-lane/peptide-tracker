import { useLiveQuery } from 'dexie-react-hooks';
import { filterByShareScope, getDb } from '@/db';
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
 * Live query: items + their non-deleted batches for the active household,
 * filtered by share scope so the active member only sees items they own
 * or items shared with the whole household. Mirrors the server-side
 * filter in withTenant.pullUpdated; needed locally because IndexedDB
 * holds rows for every member who has used this browser session.
 */
export function useInventory(
  householdId: string | null,
  activeUserId: string | null = null,
): InventoryRow[] {
  const rows = useLiveQuery(
    async () => {
      if (!householdId) return [];
      const db = getDb();
      const allItems = await db.inventoryItems
        .where('householdId')
        .equals(householdId)
        .toArray();
      const items = filterByShareScope(
        allItems.filter((i) => !i.deletedAt),
        activeUserId,
      ).sort((a, b) => a.name.localeCompare(b.name));
      const allBatches = await db.inventoryBatches
        .where('householdId')
        .equals(householdId)
        .toArray();
      const batches = filterByShareScope(
        allBatches.filter((b) => !b.deletedAt),
        activeUserId,
      );
      return items.map<InventoryRow>((item) => {
        const itemBatches = batches.filter((b) => b.itemId === item.id);
        const activeBatch = pickActiveBatch(itemBatches);
        return { item, batches: itemBatches, activeBatch };
      });
    },
    [householdId, activeUserId],
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
