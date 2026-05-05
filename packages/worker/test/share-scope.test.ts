// A0.2 share-scope + per-user privacy enforcement tests.
//
// These tests model the v1 product theory: one household, multiple
// members, per-product share scope, and dose logs / protocols private
// to the logging member. The existing sync.test.ts focuses on
// cross-household isolation; this file covers the same-household,
// different-user case the autoplan eng review flagged as missing.

import { beforeEach, describe, expect, it } from 'vitest';
import app, { type Env } from '../src/index.js';
import { FakeD1 } from './fakes/fake-d1.js';

const HOUSEHOLD = '00000000-0000-4000-8000-000000000100';
const ALEX_USER = '00000000-0000-4000-8000-000000000101';
const WIFE_USER = '00000000-0000-4000-8000-000000000102';

const ALEX_PRIVATE_ITEM = '00000000-0000-4000-8000-000000000200';
const WIFE_PRIVATE_ITEM = '00000000-0000-4000-8000-000000000201';
const SHARED_ITEM = '00000000-0000-4000-8000-000000000202';

const ALEX_DOSE_LOG = '00000000-0000-4000-8000-000000000300';
const WIFE_DOSE_LOG = '00000000-0000-4000-8000-000000000301';

const ALEX_PROTOCOL = '00000000-0000-4000-8000-000000000400';
const WIFE_PROTOCOL = '00000000-0000-4000-8000-000000000401';

let db: FakeD1;
let env: Env;

function asUser(userId: string): Record<string, string> {
  // Dev auth treats `x-dev-as` as the user id when it's a UUID. This
  // gives us a way to switch identity within a single household.
  return { 'x-dev-as': userId, 'x-dev-household': HOUSEHOLD };
}

beforeEach(() => {
  db = new FakeD1();

  // Two members in the SAME household.
  db.insertSeed('user_profiles', {
    id: ALEX_USER,
    household_id: HOUSEHOLD,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    display_name: 'Alex',
    color: '#1C1A17',
    avatar_emoji: null,
  });
  db.insertSeed('user_profiles', {
    id: WIFE_USER,
    household_id: HOUSEHOLD,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    display_name: 'Wife',
    color: '#2E5E3E',
    avatar_emoji: null,
  });

  // Three inventory items: one private to alex, one private to wife, one
  // shared with the household.
  db.insertSeed('inventory_items', {
    id: ALEX_PRIVATE_ITEM,
    household_id: HOUSEHOLD,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    name: 'Alex private vial',
    form: 'injectable_lyophilized',
    default_strength_json: null,
    default_unit_of_dose: 'mcg',
    vendor: null,
    notes_md: null,
    icon_emoji: null,
    color_tag: null,
    creator_user_id: ALEX_USER,
    share_scope: 'private',
  });
  db.insertSeed('inventory_items', {
    id: WIFE_PRIVATE_ITEM,
    household_id: HOUSEHOLD,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    name: 'Wife private vial',
    form: 'injectable_lyophilized',
    default_strength_json: null,
    default_unit_of_dose: 'mcg',
    vendor: null,
    notes_md: null,
    icon_emoji: null,
    color_tag: null,
    creator_user_id: WIFE_USER,
    share_scope: 'private',
  });
  db.insertSeed('inventory_items', {
    id: SHARED_ITEM,
    household_id: HOUSEHOLD,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    name: 'Shared BPC-157',
    form: 'injectable_lyophilized',
    default_strength_json: null,
    default_unit_of_dose: 'mcg',
    vendor: null,
    notes_md: null,
    icon_emoji: null,
    color_tag: null,
    creator_user_id: ALEX_USER,
    share_scope: 'household',
  });

  // Per-user dose logs against the shared vial.
  db.insertSeed('dose_logs', {
    id: ALEX_DOSE_LOG,
    household_id: HOUSEHOLD,
    created_at: '2026-01-03T00:00:00.000Z',
    updated_at: '2026-01-03T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    user_id: ALEX_USER,
    item_id: SHARED_ITEM,
    batch_id: null,
    dose_amount: 250,
    dose_unit: 'mcg',
    method: 'subq',
    injection_site: 'abd_ll',
    taken_at: '2026-01-03T08:00:00.000Z',
    notes_md: null,
    side_effects_json: null,
    tags_json: null,
    schedule_id: null,
    protocol_id: null,
  });
  db.insertSeed('dose_logs', {
    id: WIFE_DOSE_LOG,
    household_id: HOUSEHOLD,
    created_at: '2026-01-03T00:00:00.000Z',
    updated_at: '2026-01-03T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    user_id: WIFE_USER,
    item_id: SHARED_ITEM,
    batch_id: null,
    dose_amount: 200,
    dose_unit: 'mcg',
    method: 'subq',
    injection_site: 'thigh_l',
    taken_at: '2026-01-03T09:00:00.000Z',
    notes_md: null,
    side_effects_json: null,
    tags_json: null,
    schedule_id: null,
    protocol_id: null,
  });

  // Per-user protocols.
  db.insertSeed('protocols', {
    id: ALEX_PROTOCOL,
    household_id: HOUSEHOLD,
    created_at: '2026-01-04T00:00:00.000Z',
    updated_at: '2026-01-04T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    user_id: ALEX_USER,
    name: 'Alex stack',
    description: null,
    active: 1,
    start_date: '2026-01-04',
    end_date: null,
  });
  db.insertSeed('protocols', {
    id: WIFE_PROTOCOL,
    household_id: HOUSEHOLD,
    created_at: '2026-01-04T00:00:00.000Z',
    updated_at: '2026-01-04T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    user_id: WIFE_USER,
    name: 'Wife stack',
    description: null,
    active: 1,
    start_date: '2026-01-04',
    end_date: null,
  });

  env = {
    AUTH_MODE: 'dev',
    ENVIRONMENT: 'development',
    DB: db as unknown as NonNullable<Env['DB']>,
  };
});

describe('A0.2 inventory share-scope filter', () => {
  it("Alex's pull returns Alex's private items + shared, not Wife's private", async () => {
    const res = await app.request('/sync/pull', { headers: asUser(ALEX_USER) }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const itemIds = body.entities['inventoryItem']?.map((r) => r.id) ?? [];
    expect(itemIds).toContain(ALEX_PRIVATE_ITEM);
    expect(itemIds).toContain(SHARED_ITEM);
    expect(itemIds).not.toContain(WIFE_PRIVATE_ITEM);
  });

  it("Wife's pull returns Wife's private items + shared, not Alex's private", async () => {
    const res = await app.request('/sync/pull', { headers: asUser(WIFE_USER) }, env);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const itemIds = body.entities['inventoryItem']?.map((r) => r.id) ?? [];
    expect(itemIds).toContain(WIFE_PRIVATE_ITEM);
    expect(itemIds).toContain(SHARED_ITEM);
    expect(itemIds).not.toContain(ALEX_PRIVATE_ITEM);
  });
});

describe('A0.2 per-user dose log privacy', () => {
  it("Alex's pull returns only Alex's dose logs", async () => {
    const res = await app.request('/sync/pull', { headers: asUser(ALEX_USER) }, env);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const ids = body.entities['doseLog']?.map((r) => r.id) ?? [];
    expect(ids).toContain(ALEX_DOSE_LOG);
    expect(ids).not.toContain(WIFE_DOSE_LOG);
  });

  it("Wife's pull returns only Wife's dose logs", async () => {
    const res = await app.request('/sync/pull', { headers: asUser(WIFE_USER) }, env);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const ids = body.entities['doseLog']?.map((r) => r.id) ?? [];
    expect(ids).toContain(WIFE_DOSE_LOG);
    expect(ids).not.toContain(ALEX_DOSE_LOG);
  });
});

describe('A0.2 per-user protocol privacy', () => {
  it("Alex's pull returns only Alex's protocols", async () => {
    const res = await app.request('/sync/pull', { headers: asUser(ALEX_USER) }, env);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const ids = body.entities['protocol']?.map((r) => r.id) ?? [];
    expect(ids).toContain(ALEX_PROTOCOL);
    expect(ids).not.toContain(WIFE_PROTOCOL);
  });

  it("Wife's pull returns only Wife's protocols", async () => {
    const res = await app.request('/sync/pull', { headers: asUser(WIFE_USER) }, env);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const ids = body.entities['protocol']?.map((r) => r.id) ?? [];
    expect(ids).toContain(WIFE_PROTOCOL);
    expect(ids).not.toContain(ALEX_PROTOCOL);
  });
});

describe('A0.2 server-side stamping on insert', () => {
  it('stamps creator_user_id from principal on fresh inventory item insert', async () => {
    const newItemId = '00000000-0000-4000-8000-000000000999';
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: { ...asUser(ALEX_USER), 'content-type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: '00000000-0000-4000-8000-0000000099aa',
              entity: 'inventoryItem',
              op: 'upsert',
              expectedVersion: 0,
              payload: {
                id: newItemId,
                householdId: HOUSEHOLD,
                createdAt: '2026-01-05T00:00:00.000Z',
                updatedAt: '2026-01-05T00:00:00.000Z',
                version: 0,
                name: 'Newly added',
                form: 'injectable_lyophilized',
                // NOTE: client did NOT supply creatorUserId or shareScope.
                // Server should stamp creator = alex, shareScope = private.
              },
            },
          ],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const row = db.rowsOf('inventory_items').find((r) => r['id'] === newItemId);
    expect(row).toBeDefined();
    expect(row!['creator_user_id']).toBe(ALEX_USER);
    expect(row!['share_scope']).toBe('private');
  });

  it('preserves creator_user_id on update even if client tries to change it', async () => {
    // Wife (a different member of the same household) tries to update an
    // item Alex created and made shared. Wife is allowed to update it
    // (it's shared) but cannot reassign ownership to herself.
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: { ...asUser(WIFE_USER), 'content-type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: '00000000-0000-4000-8000-0000000099bb',
              entity: 'inventoryItem',
              op: 'upsert',
              expectedVersion: 0,
              payload: {
                id: SHARED_ITEM,
                householdId: HOUSEHOLD,
                createdAt: '2026-01-02T00:00:00.000Z',
                updatedAt: '2026-01-06T00:00:00.000Z',
                version: 0,
                name: 'Renamed by Wife',
                form: 'injectable_lyophilized',
                creatorUserId: WIFE_USER, // attempted hijack
                shareScope: 'household',
              },
            },
          ],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const row = db.rowsOf('inventory_items').find((r) => r['id'] === SHARED_ITEM);
    expect(row).toBeDefined();
    // Original creator survives.
    expect(row!['creator_user_id']).toBe(ALEX_USER);
    // Update did go through though.
    expect(row!['name']).toBe('Renamed by Wife');
  });
});
