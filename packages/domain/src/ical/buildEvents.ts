// Pure function: turn a calendar feed config + the protocols it covers into
// `IcsEvent[]`. Privacy redaction is applied here so the generator never has
// to see un-redacted fields.
//
// We emit one VEVENT per ProtocolItem with the original RRULE. iCal clients
// expand the recurrence locally, which is friendlier to subscribe-poll
// intervals than dumping every occurrence.

import type {
  CalendarFeedSettings,
  Protocol,
  ProtocolItem,
  UserProfile,
  InventoryItem,
} from '../schemas/index.js';
import { buildSummary, buildDescription, type IcsEvent } from './generate.js';

export interface BuildEventsInput {
  readonly settings: CalendarFeedSettings;
  /** All users in the household (for display name lookup). */
  readonly users: readonly UserProfile[];
  /** Protocols this feed should cover. */
  readonly protocols: readonly Protocol[];
  /** Items belonging to those protocols. */
  readonly protocolItems: readonly ProtocolItem[];
  /** Inventory items (for product-name resolution). */
  readonly inventoryItems: readonly InventoryItem[];
  /** Default duration for each event, in minutes. Defaults to 15. */
  readonly durationMinutes?: number;
  /** Earliest DTSTART date — ISO `YYYY-MM-DD`. Defaults to today. */
  readonly anchorDate?: string;
}

const DEFAULT_DURATION = 15;

export function buildEventsForFeed(input: BuildEventsInput): IcsEvent[] {
  const { settings, users, protocols, protocolItems, inventoryItems } = input;
  const userById = new Map(users.map((u) => [u.id, u]));
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  const protocolById = new Map(protocols.map((p) => [p.id, p]));

  const duration = input.durationMinutes ?? DEFAULT_DURATION;

  const events: IcsEvent[] = [];

  for (const pi of protocolItems) {
    const protocol = protocolById.get(pi.protocolId);
    if (!protocol || !protocol.active || protocol.deletedAt) continue;
    if (!includesProtocol(settings, protocol)) continue;

    const user = userById.get(protocol.userId);
    if (!user || user.deletedAt) continue;

    const dtstart = parseDtstart(input.anchorDate ?? protocol.startDate, pi.localStartTime);

    const summary = buildSummary(settings.privacy, {
      userDisplayName: user.displayName,
      productName: settings.includeProductName
        ? (itemNameById.get(pi.itemId) ?? null)
        : null,
      doseAmount: settings.includeDose ? pi.doseAmount : null,
      doseUnit: settings.includeDose ? pi.doseUnit : null,
      method: settings.includeDose ? pi.method : null,
      protocolName: settings.includeProtocolName ? protocol.name : null,
    });

    const description = buildDescription(settings.privacy, {
      userDisplayName: user.displayName,
      productName: settings.includeProductName
        ? (itemNameById.get(pi.itemId) ?? null)
        : null,
      doseAmount: settings.includeDose ? pi.doseAmount : null,
      doseUnit: settings.includeDose ? pi.doseUnit : null,
      method: settings.includeDose ? pi.method : null,
      protocolName: settings.includeProtocolName ? protocol.name : null,
    });

    events.push(buildEvent({
      uid: stableUid(pi.id),
      dtstart,
      tzid: pi.timezone,
      durationMinutes: duration,
      rrule: pi.rrule,
      summary,
      description,
      reminderMinutesBefore:
        settings.includeReminders && settings.reminderMinutesBefore?.length
          ? settings.reminderMinutesBefore
          : undefined,
    }));
  }

  return events;
}

function buildEvent(args: {
  uid: string;
  dtstart: Date;
  tzid: string;
  durationMinutes: number;
  rrule: string;
  summary: string;
  description: string | undefined;
  reminderMinutesBefore: readonly number[] | undefined;
}): IcsEvent {
  const ev: {
    uid: string;
    dtstart: Date;
    tzid: string;
    durationMinutes: number;
    rrule: string;
    summary: string;
    description?: string;
    reminderMinutesBefore?: readonly number[];
  } = {
    uid: args.uid,
    dtstart: args.dtstart,
    tzid: args.tzid,
    durationMinutes: args.durationMinutes,
    rrule: args.rrule,
    summary: args.summary,
  };
  if (args.description !== undefined) ev.description = args.description;
  if (args.reminderMinutesBefore !== undefined)
    ev.reminderMinutesBefore = args.reminderMinutesBefore;
  return ev as IcsEvent;
}

function includesProtocol(settings: CalendarFeedSettings, protocol: Protocol): boolean {
  if (settings.scope === 'household') return true;
  return protocol.userId === settings.userId;
}

function parseDtstart(localStartDate: string, localStartTime: string): Date {
  const [y, m, d] = localStartDate.split('-').map(Number);
  const [hh, mm] = localStartTime.split(':').map(Number);
  // Floating Date — calendar generator combines with TZID. The instant value
  // is the "naive" wall-clock components encoded as if UTC.
  return new Date(Date.UTC(y!, (m! - 1), d!, hh!, mm!, 0, 0));
}

export function stableUid(protocolItemId: string): string {
  return `${protocolItemId}@peptide-tracker.app`;
}
