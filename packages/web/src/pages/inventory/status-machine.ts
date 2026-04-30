import type { InventoryBatch } from '@/db';

type Status = InventoryBatch['status'];

/**
 * Allowed status transitions for an InventoryBatch. Anything not listed is
 * a programming error and will throw at runtime.
 *
 *   sealed         → reconstituted | in_use | discarded | expired
 *   reconstituted  → in_use | empty | discarded | expired
 *   in_use         → empty | discarded | expired
 *   empty          → (terminal)
 *   discarded      → (terminal)
 *   expired        → discarded   (let the user clean up the shelf)
 */
const TRANSITIONS: Record<Status, ReadonlySet<Status>> = {
  sealed: new Set(['reconstituted', 'in_use', 'discarded', 'expired']),
  reconstituted: new Set(['in_use', 'empty', 'discarded', 'expired']),
  in_use: new Set(['empty', 'discarded', 'expired']),
  empty: new Set(),
  discarded: new Set(),
  expired: new Set(['discarded']),
};

export function canTransition(from: Status, to: Status): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].has(to);
}

export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal batch status transition: ${from} → ${to}`);
  }
}

export function nextStatusOptions(from: Status): Status[] {
  return Array.from(TRANSITIONS[from]);
}
