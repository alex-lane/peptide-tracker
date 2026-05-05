import { PeptideDb } from './schema.js';
import { newId, nowIso } from './ids.js';
import type { Household, InventoryBatch, InventoryItem, UserProfile } from './types.js';

/** Spin up an isolated DB per test. Each test must call cleanup() in afterEach. */
let counter = 0;
export function makeTestDb(): PeptideDb {
  counter += 1;
  return new PeptideDb(`peptide-tracker-test-${counter}-${Date.now()}`);
}

export interface TestSeed {
  household: Household;
  alex: UserProfile;
  wife: UserProfile;
  bpc: InventoryItem;
  batch: InventoryBatch;
}

export async function seedHousehold(db: PeptideDb): Promise<TestSeed> {
  const householdId = newId();
  const household: Household = {
    id: householdId,
    householdId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
    name: 'Test Household',
    settings: {
      defaultPrivacy: 'generic',
      units: { mass: 'mcg', volume: 'mL', insulin: 'units' },
    },
  };
  const alex: UserProfile = baseUser(householdId, 'Alex', '#1C1A17');
  const wife: UserProfile = baseUser(householdId, 'Wife', '#2E5E3E');
  const bpc: InventoryItem = {
    id: newId(),
    householdId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
    name: 'Sample peptide A',
    form: 'injectable_lyophilized',
    defaultStrength: { value: 5, unit: 'mg' },
    defaultUnitOfDose: 'mcg',
    creatorUserId: alex.id,
    shareScope: 'household',
  };
  const batch: InventoryBatch = {
    id: newId(),
    householdId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
    itemId: bpc.id,
    initialQuantity: 2,
    initialQuantityUnit: 'mL',
    remainingQuantity: 2,
    status: 'reconstituted',
    reconstitution: {
      reconstitutedAt: nowIso(),
      diluentVolumeMl: 2,
      diluentType: 'bac_water',
      resultingConcentration: { value: 2.5, unit: 'mg', perMl: true },
      byUserId: alex.id,
    },
    creatorUserId: alex.id,
    shareScope: 'household',
  };
  await db.households.put(household);
  await db.userProfiles.put(alex);
  await db.userProfiles.put(wife);
  await db.inventoryItems.put(bpc);
  await db.inventoryBatches.put(batch);
  return { household, alex, wife, bpc, batch };
}

function baseUser(householdId: string, name: string, color: string): UserProfile {
  return {
    id: newId(),
    householdId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
    displayName: name,
    color,
  };
}
