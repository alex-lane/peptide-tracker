import type { PeptideDb } from '@/db';
import type { Household, UserProfile } from '@/db';
import { newId, nowIso } from '@/db';

const KEY_ACTIVE_HOUSEHOLD = 'app.activeHousehold.v1';
const KEY_ACTIVE_USER = 'app.activeUser.v1';

export interface ActiveContext {
  householdId: string | null;
  userId: string | null;
}

export async function readActive(db: PeptideDb): Promise<ActiveContext> {
  const [hh, usr] = await Promise.all([
    db.meta.get(KEY_ACTIVE_HOUSEHOLD),
    db.meta.get(KEY_ACTIVE_USER),
  ]);
  return {
    householdId: typeof hh?.value === 'string' ? hh.value : null,
    userId: typeof usr?.value === 'string' ? usr.value : null,
  };
}

export async function writeActive(db: PeptideDb, ctx: ActiveContext): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    if (ctx.householdId) {
      await db.meta.put({
        key: KEY_ACTIVE_HOUSEHOLD,
        value: ctx.householdId,
        updatedAt: nowIso(),
      });
    } else {
      await db.meta.delete(KEY_ACTIVE_HOUSEHOLD);
    }
    if (ctx.userId) {
      await db.meta.put({ key: KEY_ACTIVE_USER, value: ctx.userId, updatedAt: nowIso() });
    } else {
      await db.meta.delete(KEY_ACTIVE_USER);
    }
  });
}

/**
 * Create a household + initial user atomically and mark them as active.
 * Returns the new ids. Used by the first-run bootstrap.
 */
export async function createInitialHousehold(
  db: PeptideDb,
  args: { householdName: string; userDisplayName: string; userColor: string },
): Promise<{ household: Household; user: UserProfile }> {
  const householdId = newId();
  const userId = newId();
  const now = nowIso();

  const household: Household = {
    id: householdId,
    householdId,
    createdAt: now,
    updatedAt: now,
    version: 0,
    name: args.householdName,
    settings: {
      defaultPrivacy: 'generic',
      units: { mass: 'mcg', volume: 'mL', insulin: 'units' },
    },
  };
  const user: UserProfile = {
    id: userId,
    householdId,
    createdAt: now,
    updatedAt: now,
    version: 0,
    displayName: args.userDisplayName,
    color: args.userColor,
  };

  await db.transaction('rw', [db.households, db.userProfiles, db.outbox, db.meta], async () => {
    await db.households.put(household);
    await db.userProfiles.put(user);
    await db.outbox.add({
      mutationId: newId(),
      entity: 'household',
      op: 'upsert',
      payload: household,
      createdAt: now,
      retryCount: 0,
      lastError: null,
      ackedAt: null,
    });
    await db.outbox.add({
      mutationId: newId(),
      entity: 'userProfile',
      op: 'upsert',
      payload: user,
      createdAt: now,
      retryCount: 0,
      lastError: null,
      ackedAt: null,
    });
    await db.meta.put({ key: KEY_ACTIVE_HOUSEHOLD, value: householdId, updatedAt: now });
    await db.meta.put({ key: KEY_ACTIVE_USER, value: userId, updatedAt: now });
  });

  return { household, user };
}

export async function listHouseholds(db: PeptideDb): Promise<Household[]> {
  const all = await db.households.toArray();
  return all.filter((h) => !h.deletedAt);
}

export async function listUsersInHousehold(
  db: PeptideDb,
  householdId: string,
): Promise<UserProfile[]> {
  const all = await db.userProfiles.where('householdId').equals(householdId).toArray();
  return all.filter((u) => !u.deletedAt);
}
