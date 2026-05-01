import { describe, expect, it } from 'vitest';
import { buildEventsForFeed } from './buildEvents.js';
import { generateIcs } from './generate.js';
import type {
  CalendarFeedSettings,
  Household,
  InventoryItem,
  Protocol,
  ProtocolItem,
  UserProfile,
} from '../schemas/index.js';

const HH = 'hh';
const NOW = '2026-04-01T00:00:00.000Z';

const household: Household = {
  id: HH,
  householdId: HH,
  createdAt: NOW,
  updatedAt: NOW,
  version: 0,
  name: 'Test',
  settings: {
    defaultPrivacy: 'generic',
    units: { mass: 'mcg', volume: 'mL', insulin: 'units' },
  },
};

const alex: UserProfile = {
  id: 'u-alex',
  householdId: HH,
  createdAt: NOW,
  updatedAt: NOW,
  version: 0,
  displayName: 'Alex',
  color: '#1C1A17',
};

const wife: UserProfile = {
  id: 'u-wife',
  householdId: HH,
  createdAt: NOW,
  updatedAt: NOW,
  version: 0,
  displayName: 'Sam',
  color: '#2E5E3E',
};

const product: InventoryItem = {
  id: 'p-bpc',
  householdId: HH,
  createdAt: NOW,
  updatedAt: NOW,
  version: 0,
  name: 'Sample peptide A',
  form: 'injectable_lyophilized',
};

function makeProtocol(over: Partial<Protocol> = {}): Protocol {
  return {
    id: 'pr-1',
    householdId: HH,
    userId: alex.id,
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
    name: 'Healing stack',
    active: true,
    startDate: '2026-04-01',
    ...over,
  };
}

function makeItem(over: Partial<ProtocolItem> = {}): ProtocolItem {
  return {
    id: 'pi-1',
    protocolId: 'pr-1',
    itemId: product.id,
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    rrule: 'FREQ=DAILY',
    timezone: 'America/New_York',
    localStartTime: '08:00',
    ...over,
  };
}

function makeSettings(over: Partial<CalendarFeedSettings> = {}): CalendarFeedSettings {
  return {
    id: 'cfs-1',
    householdId: HH,
    scope: 'user',
    userId: alex.id,
    enabled: true,
    privacy: 'generic',
    includeDose: false,
    includeProtocolName: false,
    includeProductName: false,
    includeReminders: false,
    updatedAt: NOW,
    ...over,
  };
}

void household;

describe('buildEventsForFeed', () => {
  it('builds one event per active protocol item for a user-scoped feed', () => {
    const events = buildEventsForFeed({
      settings: makeSettings(),
      users: [alex, wife],
      protocols: [makeProtocol()],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe('pi-1@peptide-tracker.app');
    expect(events[0]?.tzid).toBe('America/New_York');
    expect(events[0]?.rrule).toBe('FREQ=DAILY');
  });

  it('skips inactive protocols', () => {
    const events = buildEventsForFeed({
      settings: makeSettings(),
      users: [alex],
      protocols: [makeProtocol({ active: false })],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events).toHaveLength(0);
  });

  it('user-scoped feed excludes other users', () => {
    const events = buildEventsForFeed({
      settings: makeSettings({ scope: 'user', userId: alex.id }),
      users: [alex, wife],
      protocols: [makeProtocol({ userId: wife.id })],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events).toHaveLength(0);
  });

  it('household feed includes everyone', () => {
    const events = buildEventsForFeed({
      settings: makeSettings({ scope: 'household', userId: undefined as unknown as string }),
      users: [alex, wife],
      protocols: [
        makeProtocol(),
        makeProtocol({ id: 'pr-2', userId: wife.id }),
      ],
      protocolItems: [
        makeItem(),
        makeItem({ id: 'pi-2', protocolId: 'pr-2' }),
      ],
      inventoryItems: [product],
    });
    expect(events).toHaveLength(2);
  });

  it('redacts to "Reminder" in minimal mode', () => {
    const events = buildEventsForFeed({
      settings: makeSettings({ privacy: 'minimal', includeProductName: true, includeDose: true }),
      users: [alex],
      protocols: [makeProtocol()],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events[0]?.summary).toBe('Reminder');
  });

  it('uses display name in generic mode', () => {
    const events = buildEventsForFeed({
      settings: makeSettings({ privacy: 'generic' }),
      users: [alex],
      protocols: [makeProtocol()],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events[0]?.summary).toBe('Scheduled dose — Alex');
  });

  it('full mode honors include flags for dose + product + protocol', () => {
    const events = buildEventsForFeed({
      settings: makeSettings({
        privacy: 'full',
        includeDose: true,
        includeProductName: true,
        includeProtocolName: true,
      }),
      users: [alex],
      protocols: [makeProtocol()],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events[0]?.summary).toBe('Sample peptide A 250 mcg SUBQ — Alex');
    expect(events[0]?.description).toContain('Healing stack');
  });

  it('emits VALARM blocks when reminders enabled', () => {
    const events = buildEventsForFeed({
      settings: makeSettings({ includeReminders: true, reminderMinutesBefore: [10, 60] }),
      users: [alex],
      protocols: [makeProtocol()],
      protocolItems: [makeItem()],
      inventoryItems: [product],
    });
    expect(events[0]?.reminderMinutesBefore).toEqual([10, 60]);
    const ics = generateIcs({
      calendarName: 'Test',
      privacy: 'generic',
      events,
      now: new Date(NOW),
    });
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('TRIGGER:-PT60M');
  });
});
