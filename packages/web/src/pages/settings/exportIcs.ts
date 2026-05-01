// Build a `.ics` payload locally for download. Uses the live data on the
// device and the configured CalendarFeedSettings — never sends anything to
// the network.

import {
  buildEventsForFeed,
  generateIcs,
  type CalendarFeedSettings,
  type Household,
  type InventoryItem,
  type Protocol,
  type ProtocolItem,
  type UserProfile,
} from '@peptide/domain';
import type { PeptideDb } from '@/db';

export interface BuildLocalIcsArgs {
  db: PeptideDb;
  householdId: string;
  feed: CalendarFeedSettings;
}

export async function buildLocalIcs(args: BuildLocalIcsArgs): Promise<string> {
  const { db, householdId, feed } = args;
  const household = await db.households.get(householdId);
  if (!household) throw new Error(`Household ${householdId} not found.`);

  const users = (await db.userProfiles.where('householdId').equals(householdId).toArray())
    .filter((u: UserProfile) => !u.deletedAt);
  const protocols = (await db.protocols.where('householdId').equals(householdId).toArray())
    .filter((p: Protocol) => !p.deletedAt);
  // ProtocolItem has no householdId — child of Protocol.
  const allProtocolItems = await db.protocolItems.toArray();
  const protocolIds = new Set(protocols.map((p) => p.id));
  const protocolItems = allProtocolItems.filter((pi: ProtocolItem) => protocolIds.has(pi.protocolId));
  const inventoryItems = (
    await db.inventoryItems.where('householdId').equals(householdId).toArray()
  ).filter((i: InventoryItem) => !i.deletedAt);

  const events = buildEventsForFeed({
    settings: feed,
    users,
    protocols,
    protocolItems,
    inventoryItems,
  });

  return generateIcs({
    calendarName: feedCalendarName(household, feed, users),
    privacy: feed.privacy,
    events,
  });
}

function feedCalendarName(
  household: Household,
  feed: CalendarFeedSettings,
  users: UserProfile[],
): string {
  if (feed.scope === 'user') {
    const u = users.find((x) => x.id === feed.userId);
    return `${u?.displayName ?? 'User'} — ${household.name}`;
  }
  return `${household.name} — household`;
}

/** Trigger a browser download for an ICS string. */
export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
