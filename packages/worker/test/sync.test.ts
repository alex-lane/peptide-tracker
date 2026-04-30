// Tests the /sync/pull and /sync/push routes against an in-memory D1
// stub. We're verifying behavior the routes are responsible for:
// authentication, server timestamping, OCC, idempotency, cross-household
// FK ownership, payload validation. Real SQL semantics are exercised
// via wrangler dev in M3 manual verification.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app, { type Env } from '../src/index.js';
import { FakeD1 } from './fakes/fake-d1.js';

const ALEX_HOUSEHOLD = '00000000-0000-4000-8000-000000000001';
const WIFE_HOUSEHOLD = '00000000-0000-4000-8000-000000000002';
const ALEX_USER = '00000000-0000-4000-8000-000000000003';
const WIFE_USER = '00000000-0000-4000-8000-000000000004';
const ITEM_ID = '00000000-0000-4000-8000-000000000010';
const BATCH_ID = '00000000-0000-4000-8000-000000000011';

let db: FakeD1;
let env: Env;

beforeEach(() => {
  db = new FakeD1();
  // Seed Alex's household with one user, one inventory item, one batch.
  db.insertSeed('user_profiles', {
    id: ALEX_USER,
    household_id: ALEX_HOUSEHOLD,
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
    household_id: WIFE_HOUSEHOLD,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    display_name: 'Wife',
    color: '#2E5E3E',
    avatar_emoji: null,
  });
  db.insertSeed('inventory_items', {
    id: ITEM_ID,
    household_id: ALEX_HOUSEHOLD,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    name: 'Sample peptide A',
    form: 'injectable_lyophilized',
    default_strength_json: null,
    default_unit_of_dose: 'mcg',
    vendor: null,
    notes_md: null,
    icon_emoji: null,
    color_tag: null,
  });
  db.insertSeed('inventory_batches', {
    id: BATCH_ID,
    household_id: ALEX_HOUSEHOLD,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    item_id: ITEM_ID,
    lot_number: null,
    purchased_at: null,
    purchase_price: null,
    storage_location: null,
    expires_at: null,
    initial_quantity: 2,
    initial_quantity_unit: 'mL',
    remaining_quantity: 2,
    status: 'reconstituted',
    reconstitution_json: null,
    notes_md: null,
  });

  env = {
    AUTH_MODE: 'dev',
    ENVIRONMENT: 'development',
    DB: db as unknown as NonNullable<Env['DB']>,
  };
});

afterEach(() => {
  // FakeD1 is recreated per test.
});

function alexHeaders(): Record<string, string> {
  return { 'x-dev-as': 'alex@household.local', 'x-dev-household': ALEX_HOUSEHOLD };
}
function wifeHeaders(): Record<string, string> {
  return { 'x-dev-as': 'wife@household.local', 'x-dev-household': WIFE_HOUSEHOLD };
}

describe('/sync/pull', () => {
  it('returns rows scoped to the caller household only', async () => {
    const res = await app.request('/sync/pull', { headers: alexHeaders() }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      householdId: string;
      entities: Record<string, Array<{ id: string; householdId: string }>>;
    };
    expect(body.householdId).toBe(ALEX_HOUSEHOLD);
    const userIds = body.entities['userProfile']?.map((u) => u.id) ?? [];
    expect(userIds).toContain(ALEX_USER);
    expect(userIds).not.toContain(WIFE_USER); // Wife is in a different household
  });

  it('honors `since` cursor', async () => {
    const future = '2099-01-01T00:00:00.000Z';
    const res = await app.request(
      `/sync/pull?since=${encodeURIComponent(future)}`,
      { headers: alexHeaders() },
      env,
    );
    const body = (await res.json()) as { entities: Record<string, unknown[]> };
    for (const v of Object.values(body.entities)) {
      expect(v).toEqual([]);
    }
  });

  it('serves Wife only Wife rows from her household', async () => {
    const res = await app.request('/sync/pull', { headers: wifeHeaders() }, env);
    const body = (await res.json()) as {
      entities: Record<string, Array<{ id: string }>>;
    };
    const userIds = body.entities['userProfile']?.map((u) => u.id) ?? [];
    expect(userIds).toEqual([WIFE_USER]);
  });
});

describe('/sync/push — server-stamped fields', () => {
  it('overrides client-supplied householdId and updatedAt', async () => {
    const futureTimestamp = '2099-01-01T00:00:00.000Z';
    const newItemId = '00000000-0000-4000-8000-000000000020';
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...alexHeaders() },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: '00000000-0000-4000-8000-000000000aaa',
              entity: 'inventoryItem',
              op: 'upsert',
              expectedVersion: 0,
              payload: {
                id: newItemId,
                householdId: WIFE_HOUSEHOLD, // ⚠ client-forged
                createdAt: futureTimestamp,
                updatedAt: futureTimestamp, // ⚠ client-forged
                version: 0,
                name: 'Forged item',
                form: 'capsule',
              },
            },
          ],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ status: string; canonical?: Record<string, unknown> }>;
    };
    expect(body.results[0]?.status).toBe('applied');
    const canon = body.results[0]?.canonical as Record<string, unknown>;
    expect(canon['householdId']).toBe(ALEX_HOUSEHOLD); // server overrode
    expect(canon['updatedAt']).not.toBe(futureTimestamp); // server stamped
    expect(canon['version']).toBe(1);

    // The row was actually written under Alex's household, not Wife's.
    const rows = db.rowsOf('inventory_items').filter((r) => r['id'] === newItemId);
    expect(rows.length).toBe(1);
    expect(rows[0]?.['household_id']).toBe(ALEX_HOUSEHOLD);
  });
});

describe('/sync/push — idempotency', () => {
  it('replays return the same canonical response without re-applying', async () => {
    const mutationId = '00000000-0000-4000-8000-000000000bbb';
    const newItemId = '00000000-0000-4000-8000-000000000021';
    const body = {
      mutations: [
        {
          mutationId,
          entity: 'inventoryItem' as const,
          op: 'upsert' as const,
          expectedVersion: 0,
          payload: {
            id: newItemId,
            householdId: ALEX_HOUSEHOLD,
            createdAt: '2026-04-30T00:00:00.000Z',
            updatedAt: '2026-04-30T00:00:00.000Z',
            version: 0,
            name: 'Once',
            form: 'capsule',
          },
        },
      ],
    };
    const opts = {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...alexHeaders() },
      body: JSON.stringify(body),
    };
    const first = await app.request('/sync/push', opts, env);
    const firstBody = (await first.json()) as {
      results: Array<{ status: string }>;
    };
    expect(firstBody.results[0]?.status).toBe('applied');

    // Second call same mutationId — must replay.
    const second = await app.request('/sync/push', opts, env);
    const secondBody = (await second.json()) as {
      results: Array<{ status: string }>;
    };
    expect(secondBody.results[0]?.status).toBe('replayed');

    // Only one row in DB even after the replay.
    const rows = db.rowsOf('inventory_items').filter((r) => r['id'] === newItemId);
    expect(rows.length).toBe(1);
  });
});

describe('/sync/push — OCC on version', () => {
  it('rejects stale expectedVersion as conflict (does not overwrite)', async () => {
    const mutationId = '00000000-0000-4000-8000-000000000ccc';
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...alexHeaders() },
        body: JSON.stringify({
          mutations: [
            {
              mutationId,
              entity: 'inventoryItem',
              op: 'upsert',
              expectedVersion: 5, // server has version=0
              payload: {
                id: ITEM_ID,
                householdId: ALEX_HOUSEHOLD,
                createdAt: '2026-04-30T00:00:00.000Z',
                updatedAt: '2026-04-30T00:00:00.000Z',
                version: 5,
                name: 'Renamed by stale client',
                form: 'capsule',
              },
            },
          ],
        }),
      },
      env,
    );
    const body = (await res.json()) as {
      results: Array<{ status: string; canonical?: Record<string, unknown> }>;
    };
    expect(body.results[0]?.status).toBe('conflict');

    // Existing row was not modified.
    const row = db.rowsOf('inventory_items').find((r) => r['id'] === ITEM_ID);
    expect(row?.['name']).toBe('Sample peptide A');
    expect(row?.['version']).toBe(0);
  });
});

describe('/sync/push — cross-household FK ownership', () => {
  it('rejects an inventoryBatch referencing an item in another household', async () => {
    const newBatchId = '00000000-0000-4000-8000-000000000031';
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...wifeHeaders() },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: '00000000-0000-4000-8000-000000000ddd',
              entity: 'inventoryBatch',
              op: 'upsert',
              expectedVersion: 0,
              payload: {
                id: newBatchId,
                householdId: WIFE_HOUSEHOLD,
                createdAt: '2026-04-30T00:00:00.000Z',
                updatedAt: '2026-04-30T00:00:00.000Z',
                version: 0,
                itemId: ITEM_ID, // ⚠ Alex's item
                initialQuantity: 1,
                initialQuantityUnit: 'mL',
                remainingQuantity: 1,
                status: 'sealed',
              },
            },
          ],
        }),
      },
      env,
    );
    const body = (await res.json()) as {
      results: Array<{ status: string; error?: { code: string } }>;
    };
    expect(body.results[0]?.status).toBe('rejected');
    expect(body.results[0]?.error?.code).toBe('CROSS_HOUSEHOLD_FK');

    // No row written to wife's batches.
    const rows = db.rowsOf('inventory_batches').filter((r) => r['id'] === newBatchId);
    expect(rows.length).toBe(0);
  });
});

describe('auth — dev mode header switching', () => {
  it('different x-dev-as values produce different households', async () => {
    const a = await app.request('/whoami', { headers: alexHeaders() }, env);
    const w = await app.request('/whoami', { headers: wifeHeaders() }, env);
    const aBody = (await a.json()) as { principal: { householdId: string } };
    const wBody = (await w.json()) as { principal: { householdId: string } };
    expect(aBody.principal.householdId).toBe(ALEX_HOUSEHOLD);
    expect(wBody.principal.householdId).toBe(WIFE_HOUSEHOLD);
  });
});
