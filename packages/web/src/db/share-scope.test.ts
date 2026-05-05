// Regression: ISSUE-001 — client-side share-scope filter was missing
// Found by /qa on 2026-05-05
// Report: .gstack/qa-reports/qa-report-peptide-tracker-438-pages-dev-2026-05-05.md
//
// Bob (user B) used to see Alice's (user A) private inventory items
// because the web read path filtered by householdId only and trusted
// the server's withTenant filter. On a single browser with the
// dev-mode user-switcher, both users share one IndexedDB and the
// server filter never fires. The filterByShareScope helper applies
// the same predicate locally.

import { describe, expect, it } from 'vitest';
import { filterByShareScope, isVisibleTo, type ShareScopeRow } from './share-scope.js';

const ALICE = 'alice-id';
const BOB = 'bob-id';

const alicePrivate: ShareScopeRow = { creatorUserId: ALICE, shareScope: 'private' };
const bobPrivate: ShareScopeRow = { creatorUserId: BOB, shareScope: 'private' };
const aliceShared: ShareScopeRow = { creatorUserId: ALICE, shareScope: 'household' };
const bobShared: ShareScopeRow = { creatorUserId: BOB, shareScope: 'household' };
const legacyRow: ShareScopeRow = {}; // pre-A0.1 row, no fields

describe('isVisibleTo (regression for ISSUE-001)', () => {
  it("Bob does not see Alice's private item", () => {
    expect(isVisibleTo(alicePrivate, BOB)).toBe(false);
  });

  it('Alice sees her own private item', () => {
    expect(isVisibleTo(alicePrivate, ALICE)).toBe(true);
  });

  it('Both members see household-shared items', () => {
    expect(isVisibleTo(aliceShared, ALICE)).toBe(true);
    expect(isVisibleTo(aliceShared, BOB)).toBe(true);
    expect(isVisibleTo(bobShared, ALICE)).toBe(true);
    expect(isVisibleTo(bobShared, BOB)).toBe(true);
  });

  it("Bob does not see his own creation if he's looking with the wrong viewer id", () => {
    expect(isVisibleTo(bobPrivate, ALICE)).toBe(false);
  });

  it('Legacy rows without shareScope remain visible (treated as household)', () => {
    expect(isVisibleTo(legacyRow, ALICE)).toBe(true);
    expect(isVisibleTo(legacyRow, BOB)).toBe(true);
  });

  it('Null viewer hides private items (calendar feeds, server-side render)', () => {
    expect(isVisibleTo(alicePrivate, null)).toBe(false);
    expect(isVisibleTo(aliceShared, null)).toBe(true);
    expect(isVisibleTo(legacyRow, null)).toBe(true);
  });
});

describe('filterByShareScope', () => {
  it("filters Alice's private items out of Bob's view", () => {
    const all = [alicePrivate, bobPrivate, aliceShared, bobShared];
    const fromBob = filterByShareScope(all, BOB);
    expect(fromBob).toContain(bobPrivate);
    expect(fromBob).toContain(aliceShared);
    expect(fromBob).toContain(bobShared);
    expect(fromBob).not.toContain(alicePrivate);
  });

  it("returns Alice's full set from Alice's view", () => {
    const all = [alicePrivate, bobPrivate, aliceShared, bobShared];
    const fromAlice = filterByShareScope(all, ALICE);
    expect(fromAlice).toContain(alicePrivate);
    expect(fromAlice).toContain(aliceShared);
    expect(fromAlice).toContain(bobShared);
    expect(fromAlice).not.toContain(bobPrivate);
  });

  it('preserves legacy rows for both viewers', () => {
    const fromAlice = filterByShareScope([legacyRow], ALICE);
    const fromBob = filterByShareScope([legacyRow], BOB);
    expect(fromAlice).toEqual([legacyRow]);
    expect(fromBob).toEqual([legacyRow]);
  });
});
