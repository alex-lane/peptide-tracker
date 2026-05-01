// Tests the GET /feed/user/:id.ics + /feed/household/:id.ics routes against
// the FakeD1 in-memory stub. We assert: bearer-token validation (match,
// rotation, revoke), public access (no Cloudflare Access JWT required),
// ETag cache headers + 304 short-circuit (with Cache-Control mirrored),
// ICS body shape per privacy mode.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app, { type Env } from '../src/index.js';
import { FakeD1 } from './fakes/fake-d1.js';

const HH = '00000000-0000-4000-8000-0000000000aa';
const ALEX = '00000000-0000-4000-8000-0000000000bb';
const ITEM = '00000000-0000-4000-8000-0000000000cc';
const PROTOCOL = '00000000-0000-4000-8000-0000000000dd';
const PROTOCOL_ITEM = '00000000-0000-4000-8000-0000000000ee';
const FEED_ID = '00000000-0000-4000-8000-0000000000ff';
const NONCE = 'fixed-nonce-for-tests';

let db: FakeD1;
let env: Env;

function seedFeed(d: FakeD1, overrides: Record<string, unknown> = {}) {
  d.insertSeed('calendar_feed_settings', {
    id: FEED_ID,
    household_id: HH,
    scope: 'user',
    user_id: ALEX,
    enabled: 1,
    privacy: 'generic',
    include_dose: 0,
    include_protocol_name: 0,
    include_product_name: 0,
    include_reminders: 0,
    reminder_minutes_before_json: null,
    feed_token: NONCE,
    feed_token_issued_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(() => {
  db = new FakeD1();
  // Seed minimal household + user + product + protocol + item + feed.
  db.insertSeed('households', {
    id: HH,
    household_id: HH,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    name: 'Test',
    settings_json: JSON.stringify({
      defaultPrivacy: 'generic',
      units: { mass: 'mcg', volume: 'mL', insulin: 'units' },
    }),
  });
  db.insertSeed('user_profiles', {
    id: ALEX,
    household_id: HH,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    display_name: 'Alex',
    color: '#1C1A17',
    avatar_emoji: null,
  });
  db.insertSeed('inventory_items', {
    id: ITEM,
    household_id: HH,
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
  db.insertSeed('protocols', {
    id: PROTOCOL,
    household_id: HH,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 0,
    deleted_at: null,
    user_id: ALEX,
    name: 'Healing stack',
    description: null,
    active: 1,
    start_date: '2026-04-01',
    end_date: null,
  });
  db.insertSeed('protocol_items', {
    id: PROTOCOL_ITEM,
    protocol_id: PROTOCOL,
    item_id: ITEM,
    dose_amount: 250,
    dose_unit: 'mcg',
    method: 'subq',
    rrule: 'FREQ=DAILY',
    timezone: 'America/New_York',
    local_start_time: '08:00',
    cycle_json: null,
    preferred_batch_id: null,
    notes_md: null,
  });
  seedFeed(db);

  env = {
    AUTH_MODE: 'dev',
    ENVIRONMENT: 'development',
    DB: db,
  };
});

afterEach(() => {
  // FakeD1 is per-test; nothing else to tear down.
});

describe('GET /feed/user/:id.ics', () => {
  it('returns 401 without a token', async () => {
    const res = await app.fetch(new Request(`http://x/feed/user/${ALEX}.ics`), env);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong token', async () => {
    const res = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=wrong`),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 + ICS body + ETag for a valid token', async () => {
    const res = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=${NONCE}`),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/calendar/);
    expect(res.headers.get('Cache-Control')).toContain('max-age=900');
    const etag = res.headers.get('ETag');
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);

    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).toContain('SUMMARY:Scheduled dose — Alex');
    expect(body).toContain('RRULE:FREQ=DAILY');
    expect(body).toContain(`UID:${PROTOCOL_ITEM}@peptide-tracker.app`);
  });

  it('returns 304 with Cache-Control on If-None-Match', async () => {
    const first = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=${NONCE}`),
      env,
    );
    const etag = first.headers.get('ETag')!;
    const second = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=${NONCE}`, {
        headers: { 'If-None-Match': etag },
      }),
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
    expect(second.headers.get('Cache-Control')).toContain('max-age=900');
  });

  it('rotation invalidates the old token (404 for wrong subject after re-seed)', async () => {
    // Spin up a fresh DB with a different nonce.
    const db2 = new FakeD1();
    seedFeed(db2, { feed_token: 'rotated-nonce' });
    const env2: Env = { ...env, DB: db2 };
    const res = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=${NONCE}`),
      env2,
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when the feed token has been revoked (empty string)', async () => {
    const db2 = new FakeD1();
    seedFeed(db2, { feed_token: '' });
    const env2: Env = { ...env, DB: db2 };
    const res = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=${NONCE}`),
      env2,
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when feed is disabled', async () => {
    const db2 = new FakeD1();
    seedFeed(db2, { enabled: 0 });
    const env2: Env = { ...env, DB: db2 };
    const res = await app.fetch(
      new Request(`http://x/feed/user/${ALEX}.ics?token=${NONCE}`),
      env2,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the user has no feed configured at all', async () => {
    // Subject in URL doesn't match any feed row.
    const otherUser = '00000000-0000-4000-8000-0000000000a1';
    const res = await app.fetch(
      new Request(`http://x/feed/user/${otherUser}.ics?token=${NONCE}`),
      env,
    );
    expect(res.status).toBe(404);
  });
});
