import { describe, expect, it } from 'vitest';
import {
  doseLog,
  educationContent,
  household,
  inventoryAdjustment,
  inventoryBatch,
  inventoryItem,
  protocolItem,
  schemaByEntity,
  syncEntityName,
  userProfile,
} from './index.js';

const NOW = '2026-04-29T10:00:00Z';
const HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ITEM_ID = '00000000-0000-4000-8000-000000000003';
const BATCH_ID = '00000000-0000-4000-8000-000000000004';
const PROTOCOL_ID = '00000000-0000-4000-8000-000000000005';
const PROTOCOL_ITEM_ID = '00000000-0000-4000-8000-000000000006';
const ADJUSTMENT_ID = '00000000-0000-4000-8000-000000000007';
const MUTATION_ID = '00000000-0000-4000-8000-000000000008';

describe('schemas — base shape', () => {
  it('every entity in schemaByEntity matches the syncEntityName enum', () => {
    const enumValues = syncEntityName.options;
    const schemaKeys = Object.keys(schemaByEntity);
    expect(new Set(schemaKeys)).toEqual(new Set(enumValues));
  });
});

describe('household', () => {
  it('parses a minimal valid household', () => {
    const r = household.parse({
      id: HOUSEHOLD_ID,
      householdId: HOUSEHOLD_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
      name: 'Lane',
      settings: {
        defaultPrivacy: 'generic',
        units: { mass: 'mcg', volume: 'mL', insulin: 'units' },
      },
    });
    expect(r.name).toBe('Lane');
  });

  it('rejects bad timezones, bad uuids', () => {
    expect(() =>
      household.parse({
        id: 'not-a-uuid',
        householdId: HOUSEHOLD_ID,
        createdAt: NOW,
        updatedAt: NOW,
        version: 1,
        name: 'X',
        settings: { units: {} },
      }),
    ).toThrow();
  });
});

describe('userProfile', () => {
  it('requires #RRGGBB color', () => {
    const base = {
      id: USER_ID,
      householdId: HOUSEHOLD_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 0,
      displayName: 'Alex',
      color: '#1C1A17',
    };
    expect(userProfile.parse(base).displayName).toBe('Alex');
    expect(() => userProfile.parse({ ...base, color: 'red' })).toThrow();
    expect(() => userProfile.parse({ ...base, color: '#abc' })).toThrow();
  });
});

describe('inventoryItem + inventoryBatch', () => {
  it('parses an item template', () => {
    const r = inventoryItem.parse({
      id: ITEM_ID,
      householdId: HOUSEHOLD_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 0,
      name: 'Sample peptide A',
      form: 'injectable_lyophilized',
      defaultStrength: { value: 5, unit: 'mg' },
      defaultUnitOfDose: 'mcg',
      creatorUserId: USER_ID,
      shareScope: 'household',
    });
    expect(r.form).toBe('injectable_lyophilized');
  });

  it('parses a batch with reconstitution record', () => {
    const r = inventoryBatch.parse({
      id: BATCH_ID,
      householdId: HOUSEHOLD_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 0,
      itemId: ITEM_ID,
      initialQuantity: 5,
      initialQuantityUnit: 'mg',
      remainingQuantity: 5,
      status: 'reconstituted',
      reconstitution: {
        reconstitutedAt: NOW,
        diluentVolumeMl: 2,
        diluentType: 'bac_water',
        resultingConcentration: { value: 2.5, unit: 'mg', perMl: true },
        byUserId: USER_ID,
      },
      creatorUserId: USER_ID,
      shareScope: 'household',
    });
    expect(r.status).toBe('reconstituted');
    expect(r.reconstitution?.diluentVolumeMl).toBe(2);
  });

  it('rejects negative remainingQuantity', () => {
    expect(() =>
      inventoryBatch.parse({
        id: BATCH_ID,
        householdId: HOUSEHOLD_ID,
        createdAt: NOW,
        updatedAt: NOW,
        version: 0,
        itemId: ITEM_ID,
        initialQuantity: 5,
        initialQuantityUnit: 'mg',
        remainingQuantity: -1,
        status: 'sealed',
      }),
    ).toThrow();
  });
});

describe('protocolItem', () => {
  it('requires IANA timezone and HH:mm local start time', () => {
    const valid = {
      id: PROTOCOL_ITEM_ID,
      protocolId: PROTOCOL_ID,
      itemId: ITEM_ID,
      doseAmount: 250,
      doseUnit: 'mcg',
      method: 'subq',
      rrule: 'FREQ=DAILY',
      timezone: 'America/New_York',
      localStartTime: '08:00',
    };
    expect(protocolItem.parse(valid).timezone).toBe('America/New_York');
    expect(() => protocolItem.parse({ ...valid, timezone: 'Bogus_TZ_Name' })).toThrow();
    expect(() => protocolItem.parse({ ...valid, localStartTime: '8am' })).toThrow();
  });

  it('accepts UTC + utc-aliased zones', () => {
    const v = (tz: string) =>
      protocolItem.parse({
        id: PROTOCOL_ITEM_ID,
        protocolId: PROTOCOL_ID,
        itemId: ITEM_ID,
        doseAmount: 1,
        doseUnit: 'mg',
        method: 'oral',
        rrule: 'FREQ=DAILY',
        timezone: tz,
        localStartTime: '00:00',
      });
    expect(v('UTC').timezone).toBe('UTC');
    expect(v('Etc/UTC').timezone).toBe('Etc/UTC');
    expect(v('America/Los_Angeles').timezone).toBe('America/Los_Angeles');
  });
});

describe('inventoryAdjustment', () => {
  it('rejects zero / non-finite delta', () => {
    const base = {
      id: ADJUSTMENT_ID,
      householdId: HOUSEHOLD_ID,
      batchId: BATCH_ID,
      unit: 'mL',
      reason: 'dose_log',
      mutationId: MUTATION_ID,
      byUserId: USER_ID,
      createdAt: NOW,
    };
    expect(() => inventoryAdjustment.parse({ ...base, delta: 0 })).toThrow();
    expect(() => inventoryAdjustment.parse({ ...base, delta: NaN })).toThrow();
    expect(() => inventoryAdjustment.parse({ ...base, delta: Infinity })).toThrow();
    expect(inventoryAdjustment.parse({ ...base, delta: -0.1 }).delta).toBe(-0.1);
  });
});

describe('doseLog', () => {
  it('parses a complete dose log', () => {
    const r = doseLog.parse({
      id: '00000000-0000-4000-8000-00000000000a',
      householdId: HOUSEHOLD_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 0,
      userId: USER_ID,
      itemId: ITEM_ID,
      batchId: BATCH_ID,
      doseAmount: 250,
      doseUnit: 'mcg',
      method: 'subq',
      injectionSite: 'abd_ul',
      takenAt: NOW,
      sideEffects: ['mild flushing'],
    });
    expect(r.doseUnit).toBe('mcg');
  });
});

describe('educationContent', () => {
  it('parses minimal educational content', () => {
    const r = educationContent.parse({
      id: '00000000-0000-4000-8000-00000000000b',
      slug: 'bpc-157',
      name: 'BPC-157',
      lastUpdated: NOW,
    });
    expect(r.slug).toBe('bpc-157');
  });

  it('rejects non-kebab slugs', () => {
    expect(() =>
      educationContent.parse({
        id: '00000000-0000-4000-8000-00000000000b',
        slug: 'BPC_157',
        name: 'BPC-157',
        lastUpdated: NOW,
      }),
    ).toThrow();
  });

  it('citations require a valid URL', () => {
    expect(() =>
      educationContent.parse({
        id: '00000000-0000-4000-8000-00000000000b',
        slug: 'bpc-157',
        name: 'BPC-157',
        lastUpdated: NOW,
        citations: [{ title: 'Study', url: 'not a url' }],
      }),
    ).toThrow();
  });
});
