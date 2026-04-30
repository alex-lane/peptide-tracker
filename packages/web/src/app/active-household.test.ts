import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@/db/test-helpers';
import {
  createInitialHousehold,
  listHouseholds,
  listUsersInHousehold,
  readActive,
  writeActive,
} from './active-household';
import { household as householdSchema, userProfile as userProfileSchema } from '@peptide/domain';
import type { PeptideDb } from '@/db';

let db: PeptideDb;

beforeEach(async () => {
  db = makeTestDb();
  await db.open();
});

afterEach(() => {
  db.close();
});

describe('active-household', () => {
  it('readActive returns nulls when no household has been created', async () => {
    expect(await readActive(db)).toEqual({ householdId: null, userId: null });
  });

  it('createInitialHousehold writes household + user, marks them active, and queues outbox rows', async () => {
    const { household, user } = await createInitialHousehold(db, {
      householdName: 'Lane',
      userDisplayName: 'Alex',
      userColor: '#1C1A17',
    });

    // Schemas accept the rows we wrote.
    expect(householdSchema.safeParse(household).success).toBe(true);
    expect(userProfileSchema.safeParse(user).success).toBe(true);

    // Active context is now set.
    expect(await readActive(db)).toEqual({
      householdId: household.id,
      userId: user.id,
    });

    // Two outbox rows queued (1 household + 1 user).
    expect(await db.outbox.count()).toBe(2);
    const entities = (await db.outbox.toArray()).map((r) => r.entity).sort();
    expect(entities).toEqual(['household', 'userProfile']);
  });

  it('writeActive can clear the context', async () => {
    await createInitialHousehold(db, {
      householdName: 'X',
      userDisplayName: 'X',
      userColor: '#1C1A17',
    });
    await writeActive(db, { householdId: null, userId: null });
    expect(await readActive(db)).toEqual({ householdId: null, userId: null });
  });

  it('listHouseholds + listUsersInHousehold ignore soft-deleted rows', async () => {
    const { household, user } = await createInitialHousehold(db, {
      householdName: 'Lane',
      userDisplayName: 'Alex',
      userColor: '#1C1A17',
    });
    expect((await listHouseholds(db)).length).toBe(1);
    expect((await listUsersInHousehold(db, household.id)).length).toBe(1);

    // Soft-delete the user manually (simulate repo path).
    await db.userProfiles.put({ ...user, deletedAt: new Date().toISOString() });
    expect((await listUsersInHousehold(db, household.id)).length).toBe(0);
  });
});
