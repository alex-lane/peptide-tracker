# Peptide Tracker — Product & Technical Plan

## Context

You want a private, web-based tracker for peptides/enzymes/supplements that:
- Works for **a household of multiple users sharing one inventory** but with separate logs/protocols per person.
- Runs cheaply or for free (GitHub Pages, home host, or PWA on phone) in v1.
- Could grow into a **multi-tenant SaaS** later with minimal rewrite.
- Is **explicitly not medical advice** — it tracks, calculates, and reminds, but never recommends doses.
- Generates **calendar feeds** for scheduled doses with privacy-aware titles.

The plan below is a planning package, not implementation. Execute via the Claude prompt sequence in §12.

---

## 1. Product Vision

> **A private, local-first dose & inventory companion for households who self-administer peptides, enzymes, and supplements — calculator-grade math, polished UX, zero medical claims.**

Core promises:
1. **Never lose track of what's in the fridge.** Shared, real-time inventory with depletion forecasting.
2. **Never make a unit error.** Reconstitution + dose math with explicit conversions and red-flag warnings.
3. **Never forget a dose.** Calendar-feed integration so doses appear in Apple/Google/Outlook calendars.
4. **Always own your data.** Local-first storage, exportable JSON, optional encrypted sync.
5. **Adults-treat-adults framing.** No prescriptive guidance; the user's protocol is the user's protocol.

Non-goals (explicit):
- No dose recommendations, no "max safe dose" suggestions, no diagnostic features.
- No social/sharing features beyond a household.
- No marketplace, no e-commerce, no vendor integrations.

---

## 2. MVP Scope

### v1 — In Scope (ship first)
- Single household, 1–4 user profiles, **live-synced across devices**.
- Inventory CRUD: vials, capsules, sprays, powders, supplies (syringes, BAC water, alcohol pads).
- Reconstitution calculator + dose calculator (mcg/mg/IU/mL/insulin units/drops).
- Per-user dose logs with site rotation for injectables.
- Manual dose schedules (recurring) + protocol builder (named stacks).
- Dashboard: today's doses, low/expiring inventory, recent logs, active protocols, user switcher.
- Inventory auto-deduction on dose log; manual adjustments with audit trail.
- **Local-first persistence (IndexedDB via Dexie) with Cloudflare D1 sync** through a Worker API. Offline-first; queues writes when offline.
- Auth via **Cloudflare Access** (email OTP / Google) — free for ≤50 users, gates the whole app at the edge.
- **Hosted live calendar feed URL** at `https://app.../feed/:user.ics?token=…` plus downloadable `.ics`. Privacy-mode toggle.
- JSON export/import for backup.
- PWA install on iOS/Android/desktop.
- Hard-coded safety modal on first-run + warnings on risky inputs.
- Disclaimer footer + onboarding consent screen.

### v1.5 — Postponed (high value, moderate effort)
- Custom metrics + symptom/biomarker logging with simple charts.
- PIN/passphrase lock with WebCrypto-encrypted IndexedDB *for the local cache* (cloud already encrypted in transit + at rest).
- Recurring local notifications via Push API (where supported).
- Server-driven Web Push for missed-dose nudges.
- CRDT layer (Yjs) if simultaneous-edit conflicts become a real problem.

### v2+ — Postponed (commercial / SaaS readiness)
- Multi-tenant auth (email + magic link / OAuth).
- Stripe billing.
- Server-side push notifications.
- Mobile-native wrappers (Capacitor) if PWA limits hurt.
- Audit log + GDPR delete/export endpoints.

### Risky / Cut from v1
- ❌ Server-hosted calendar feeds (needs always-on URL → not pure GitHub Pages).
- ❌ Multi-device live sync (requires backend or CRDT layer; defer until needed).
- ❌ Camera-based vial barcode scanning (nice-to-have, slips fast).
- ❌ AI-driven correlations / "insights" (medical-claim risk).
- ❌ Real-time push reminders on iOS Safari (Web Push on iOS is gated/unreliable on home-screen PWAs pre-2024; treat as best-effort only).

---

## 3. Feature Breakdown

### 3.1 Inventory
- Entities: **Product** (template: BPC-157 5mg vial), **Batch/Vial** (specific instance with lot, expiry, reconstitution state), **Supply** (consumables: syringes, BAC, pads).
- Status states for vials: `sealed → reconstituted → in-use → empty → discarded → expired`.
- Reconstitution record (BAC water added, concentration, reconstituted-at, discard-by date).
- Forecast remaining doses given active schedules drawing from this batch.
- Storage location, vendor, purchase date/price, notes (markdown).
- Color/icon tagging.

### 3.2 Calculators
- **Reconstitution**: vial mass + diluent volume → concentration (mcg/mL).
- **Dose volume**: target dose (mcg/mg/IU) + concentration → volume (mL) + insulin-syringe units (1 unit = 0.01 mL on U-100).
- **Capsule/tablet**: dose × strength → count.
- **Drop/spray**: dose × per-actuation strength → actuations.
- Save as preset per product; show all conversions and assumptions inline; show **explicit unit chips** on every number.

### 3.3 Users / Households
- Workspace = household. One workspace in v1; data model already keyed by `householdId` for SaaS day-1.
- User profile: display name, color, avatar, protocols, logs, metrics, calendar settings.
- User switcher in header (no auth in v1; switch is a local act).

### 3.4 Dose Logging
- Log entry: `userId, productId, batchId, dose, unit, method, siteId?, takenAt, notes, sideEffects[], tags[], protocolId?, scheduleId?`.
- Site-rotation overlay (body diagram) for injectables.
- Calendar/timeline/history views.
- "Skip / missed / take now" affordances against scheduled items.
- Inventory deduction is a **derived ledger entry** (`InventoryAdjustment`) tied to the dose log.

### 3.5 Protocol Builder
- Protocol = ordered list of `ProtocolItem`s (product, dose, schedule, cycle).
- Cycles: "5 on / 2 off", "8 weeks on / 4 off", custom RRULE strings.
- Per-user. Expansion → `DoseSchedule` rows for the next N days.
- Burn-down forecast: project depletion date for each linked batch.

### 3.6 Insights
- Adherence % (logged ÷ scheduled, last 30/90 days).
- Inventory burn-down chart per product.
- Custom metric tracking (weight, sleep, energy, mood — user-defined).
- Per-user PDF/CSV export.
- **No clinical interpretation, no green/red "outcome" labels.**

### 3.7 Safety / Disclaimers
- First-run consent + permanent footer disclaimer.
- Confirmation modals when:
  - Logged dose exceeds the previous max for that product by >2× (sanity check, not "max safe").
  - Vial is past its discard-by date.
  - Inventory mismatch (drawing from a different batch than the schedule expects).
  - Unit mismatch detected (e.g., schedule in mg, log in mcg).
- "Show your work" panel under every calculator.

### 3.8 Calendar Integration
- See §5 below.

### 3.9 Design / UX
- See §8 below.

---

## 4. Recommended Architecture

> **Stack at a glance:** Cloudflare Pages (static SPA) + Cloudflare Workers (API + ICS feeds) + Cloudflare D1 (SQLite at the edge) + Cloudflare Access (auth). Local-first on the client via Dexie/IndexedDB; Workers expose a thin sync API.

### 4.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Hosting | **Cloudflare Pages** | Free static hosting, built-in TLS, edge cache, Workers integration. |
| API / edge compute | **Cloudflare Workers** | 100k req/day free, no cold starts, serves sync + ICS feeds. |
| Database | **Cloudflare D1** (SQLite) | Free tier 5GB / 25M reads / 50k writes per day. Schema mirrors Dexie. |
| Auth | **Cloudflare Access** (Zero Trust) | Free for ≤50 users; email OTP / Google / GitHub. Gates the whole app at the edge — zero auth code on our side. |
| Build | **Vite** + React + TypeScript | Fastest DX, static-deployable. |
| Styling | **Tailwind v4 + shadcn/ui + Radix** | Polished primitives, mobile-first. |
| Local storage | **Dexie (IndexedDB)** | Offline-first cache; sync to D1 via Worker. |
| State | **Zustand** + **TanStack Query** | Lightweight, no Redux ceremony. |
| Forms | **react-hook-form + Zod** | Schema-first validation reused at boundaries. |
| Charts | **Recharts** | Fast to ship; swap for visx later if needed. |
| Routing | **React Router** (BrowserRouter — Pages supports SPA fallback) | Cleaner URLs than HashRouter. |
| PWA | **vite-plugin-pwa (Workbox)** | Battle-tested service worker pipeline. |
| Date/RRULE | **date-fns + rrule** | Smaller than moment; rrule for iCal RRULE parity. |
| iCal | **ics** (npm) | Generates RFC-5545 valid `.ics` files; runs on both client and Worker. |
| ORM (Worker side) | **Drizzle** (D1 dialect) | Type-safe, lightweight, plays nicely with Workers. |
| Crypto (later) | **WebCrypto API** (AES-GCM + PBKDF2) | Browser-native, no deps. |
| Tests | **Vitest + Testing Library + Playwright + miniflare** | Vitest for math/units, miniflare for Worker tests. |
| CLI | **wrangler** | Single tool for Pages, Workers, D1 migrations, Access config. |

### 4.2 Local-first + edge-synced architecture

```
                ┌───────────────────────────────────────┐
                │  Phone / desktop (PWA)                │
                │ ┌───────────────────────────────────┐ │
                │ │ React UI                          │ │
                │ │  Pages (Today, Inventory, ...)    │ │
                │ ├───────────────────────────────────┤ │
                │ │ Domain layer (pure TS — shared    │ │
                │ │   verbatim with Worker)           │ │
                │ │  schemas/ math/ scheduling/       │ │
                │ │  inventory/ ical/                 │ │
                │ ├───────────────────────────────────┤ │
                │ │ Dexie (IndexedDB) — local cache   │ │
                │ │  + outbox of pending mutations    │ │
                │ ├───────────────────────────────────┤ │
                │ │ Sync client (TanStack Query +     │ │
                │ │   simple op-log replay)           │ │
                │ └───────────────┬───────────────────┘ │
                └─────────────────┼─────────────────────┘
                                  │ HTTPS (Access JWT)
                ┌─────────────────▼─────────────────────┐
                │  Cloudflare Access (Zero Trust)       │
                │  email-OTP / Google → JWT → Worker    │
                └─────────────────┬─────────────────────┘
                                  │
                ┌─────────────────▼─────────────────────┐
                │  Cloudflare Worker (API + ICS)        │
                │   /sync/pull?since=…                  │
                │   /sync/push (upserts by updated_at)  │
                │   /feed/:userId.ics?token=…           │
                │   /feed/household/:hid.ics?token=…    │
                │   shares the SAME domain layer        │
                ├───────────────────────────────────────┤
                │  Cloudflare D1 (SQLite at the edge)   │
                │   schema mirrors Dexie 1:1            │
                │   household_id is the tenant key      │
                └───────────────────────────────────────┘
```

Key properties:

- **Domain layer is framework-free pure TypeScript** — the *exact same files* run in the browser and in the Worker. Calculators, RRULE expansion, and ICS generation are written once.
- **Offline-first**: every mutation hits Dexie immediately and is queued in an outbox; the sync client drains the outbox to `/sync/push` when online.
- **Conflict policy v1**: last-write-wins per row using `updated_at` + `version`. Soft deletes via `deleted_at`. Good enough for a 2–4 person household; revisit with CRDTs only if real conflicts emerge.
- **Tenant isolation**: every D1 row carries `household_id`; every Worker handler resolves the caller's `household_id` from the Access JWT and `WHERE household_id = ?` is mandatory in every query (enforced via a Drizzle helper / lint rule).

### 4.3 Storage Comparison (free tiers, household scale)

| Option | v1 fit | Free-tier reality | Pros | Cons |
|---|---|---|---|---|
| `localStorage` | ❌ | n/a | Trivial. | 5MB cap, lossy types. |
| **Dexie (IndexedDB)** | ✅ **client cache** | Browser-local, ~50% of disk. | Offline-first, indexed, async. | Per-device; needs sync to share inventory. |
| **Cloudflare D1** | ✅ **server of record** | 5 GB / 25M reads / 50k writes per day. | SQLite — mirrors Dexie schema, Drizzle-typed, edge-served. | Newer than Postgres; backups via wrangler. |
| Cloudflare KV | ⚠️ side use | 100k reads/day, 1k writes/day. | Great for tokens/feeds cache. | Not relational. |
| Supabase Postgres | ❌ for v1 | 500MB, 50k MAU, **pauses after 7d idle**. | Mature Postgres + RLS. | Idle-pause kills a low-traffic household app. |
| Azure Cosmos DB free tier | ⚠️ | 1000 RU/s + 25 GB free. | If you stay in Azure end-to-end. | Document-model ↔ relational mismatch; mixing with Cloudflare Pages = two control planes. |
| Azure SQL serverless | ⚠️ | Auto-pause; cold starts. | Familiar T-SQL. | Cold-start friction on a chatty sync client. |
| Self-hosted Postgres | ⚠️ | $0 if home server. | Full control. | You operate it. |

**Recommended v1 pick: Dexie (client cache) + Cloudflare D1 (server of record).** The Dexie schema and the D1 schema are the same field names; Drizzle generates types from D1 and Zod schemas validate at both ends.

**Why not Cosmos despite Azure fluency?** The document model would force every aggregate into a denormalized blob, and you'd lose the clean `inventoryAdjustments` ledger semantics that protect dose-deduction correctness. If you want to stay in Azure, the closest equivalent is Azure SQL (relational), but the auto-pause/cold-start trade-off is worse than D1's always-on edge. Easy to revisit later — the domain layer doesn't care which SQL backend it talks to.

### 4.4 PWA Feasibility — ✅ recommended

- `vite-plugin-pwa` generates the service worker + manifest.
- Offline-first: precache app shell, runtime-cache for fonts.
- Installable on iOS 16.4+ (limited push), Android, and desktop Chrome/Edge.
- "Add to Home Screen" works on GitHub Pages.

### 4.5 Cloudflare Pages Feasibility — ✅ recommended

- Native SPA fallback (no 404.html hacks) — use `BrowserRouter`.
- Built-in TLS, HTTP/3, custom domain, preview deploys per branch.
- Wrangler CLI handles Pages + Workers + D1 in one tool.
- Workers can be co-deployed as Pages Functions or as standalone routes (`/api/*`, `/feed/*`).
- Cloudflare Access lives at the edge — no auth boilerplate in the app.

### 4.6 GitHub Pages — fallback only

Possible, but loses live sync and hosted ICS feeds — degrades v1 to manual JSON sync. Keep as a "what if I lose Cloudflare" escape hatch by ensuring the build also runs without Workers (the sync adapter falls back to JSON-only mode).

### 4.7 Self-hosting Feasibility — possible later

Three viable paths if you ever leave Cloudflare:
1. **Static site + Tailscale** at home (Caddy/Nginx).
2. **Docker compose**: Caddy + the static bundle + tiny Node API + SQLite.
3. **Azure Static Web Apps + Functions + Cosmos / Azure SQL** — natural if you want to stay in Azure for billing/governance reasons.

---

## 5. Calendar Integration Architecture

### 5.1 Static `.ics` export vs live subscription feed

| | Static `.ics` (download) | Live subscription URL |
|---|---|---|
| Hosting cost | $0 (any static host) | Needs always-on endpoint |
| Refresh model | User re-imports manually after schedule change | Calendar app polls every N hours |
| Best for | First-run, occasional users, GH Pages | Daily-driver households |
| GitHub Pages OK? | ✅ | ❌ (no per-user URL) |
| Apple Calendar | Import works; subscribe-from-URL also OK if hosted | Subscribe-from-URL native |
| Google Calendar | Import works | "Add by URL" → polls hourly–daily |
| Outlook | Import works | "Subscribe to calendar" → polls |

### 5.2 Local-only limitations

A purely local-first PWA **cannot serve a calendar URL** because there's no public endpoint. The phone's calendar app can't poll IndexedDB. So:
- For **subscription**, you need *some* public, reachable URL — even if it's just a Cloudflare Worker reading from a small KV store.
- For **download-and-import**, none of that matters: pure client-side blob → `.ics` file → user imports.

### 5.3 Recommended approach (v1 ships both)

Because we now have Cloudflare Workers in v1, we ship **both** the download path and the hosted-feed path in v1:

**Hosted live feed (primary):**
1. Worker route `GET /feed/user/:userId.ics?token=…` and `GET /feed/household/:householdId.ics?token=…`.
2. Token = HMAC-SHA256 signed, scoped, revocable + rotatable from Settings → Calendar.
3. Worker reads schedules from D1, runs the same `domain/ical/generate.ts` used in the client, returns ICS with `ETag`, `Cache-Control: max-age=900`, and `Last-Modified`.
4. RRULE-compressed events; one VEVENT per recurring schedule.
5. Stable UIDs `{scheduleId}@peptide-tracker.app`.
6. Privacy modes as feed-config (stored on `CalendarFeedSettings`), not URL params, so a leaked URL can't unmask data.

**Download `.ics` (companion):**
1. Same generator, fired client-side, blob-downloaded — useful for one-shot exports, archive, sharing with a clinician, etc.
2. Same UIDs, so re-import into a calendar that's already subscribed deduplicates.

**Privacy modes** `Full | Generic | Minimal`:
- Full: `BPC-157 250mcg SubQ — Alex`
- Generic: `Scheduled dose — Alex`
- Minimal: `Reminder` (no name, no user)

### 5.4 Compatibility

- **Apple Calendar (iOS/macOS)**: Subscribe via URL (`webcal://` or `https://`). Auto-refresh interval user-configurable.
- **Google Calendar**: "Add calendar → From URL". Refresh ~every 8h, sometimes 24h. *Caveat: Google does not honor `REFRESH-INTERVAL`.*
- **Outlook (web/desktop)**: "Add calendar → Subscribe from web". Polls every 3h roughly.
- **All three** support RFC-5545 RRULE, VTIMEZONE, alarms (`VALARM`).

### 5.5 Privacy/security concerns of feed URLs

Risks:
- **Anyone with the URL can read your dose schedule.** No password header on subscribe.
- Logged in upstream proxies / corporate calendars.
- Cached on the phone in plaintext.

Mitigations:
1. Long, opaque, HMAC-signed token in path.
2. **Revoke + rotate** UI ("regenerate URL").
3. Default to `Generic` privacy mode.
4. Never include lot numbers, vendors, or notes in feed.
5. Optional: per-feed expiration date.

---

## 6. Data Model

All entities carry: `id` (uuid v7), `householdId`, `createdAt`, `updatedAt`, `deletedAt?` (soft delete), `version` (for sync conflict).

```ts
// ─── Workspace ───────────────────────────────────────────────
export interface Household {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string;
  settings: {
    defaultPrivacy: CalendarPrivacy;
    units: { mass: 'mcg' | 'mg'; volume: 'mL'; insulin: 'units' };
  };
}

export interface UserProfile {
  id: string;
  householdId: string;
  displayName: string;
  color: string; // hex
  avatarEmoji?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Inventory ───────────────────────────────────────────────
export type ProductForm =
  | 'injectable_lyophilized'   // requires reconstitution
  | 'injectable_solution'      // pre-mixed
  | 'capsule' | 'tablet'
  | 'powder_oral'
  | 'spray_nasal' | 'spray_oral'
  | 'drops_oral' | 'drops_eye'
  | 'topical_cream' | 'topical_patch'
  | 'supply';                  // syringes, BAC, pads

export interface InventoryItem {           // template / SKU
  id: string;
  householdId: string;
  name: string;                            // "BPC-157"
  form: ProductForm;
  defaultStrength?: { value: number; unit: MassUnit };  // e.g. 5 mg per vial
  defaultUnitOfDose?: DoseUnit;            // 'mcg'
  vendor?: string;
  notesMd?: string;
  iconEmoji?: string;
  colorTag?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface InventoryBatch {          // a specific vial / bottle / box
  id: string;
  householdId: string;
  itemId: string;                          // → InventoryItem
  lotNumber?: string;
  purchasedAt?: string;
  purchasePrice?: number;
  storageLocation?: string;
  expiresAt?: string;                      // sealed expiry
  initialQuantity: number;
  initialQuantityUnit: 'mg' | 'mcg' | 'mL' | 'capsules' | 'tablets' | 'sprays' | 'drops' | 'g';
  remainingQuantity: number;               // derived but cached for fast queries
  status: 'sealed' | 'reconstituted' | 'in_use' | 'empty' | 'discarded' | 'expired';
  reconstitution?: ReconstitutionRecord;
  notesMd?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ReconstitutionRecord {
  reconstitutedAt: string;
  diluentVolumeMl: number;                 // BAC water added
  diluentType: 'bac_water' | 'sterile_water' | 'other';
  resultingConcentration: { value: number; unit: MassUnit; perMl: true };
  discardByAt?: string;                    // user-defined; default 30 days reminder
  byUserId: string;
  notesMd?: string;
}

export interface SupplyItem {              // syringes, pads, BAC
  id: string;
  householdId: string;
  itemId: string;                          // InventoryItem with form='supply'
  remainingCount: number;
  thresholdLowCount?: number;
  notesMd?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Protocol & Scheduling ───────────────────────────────────
export interface Protocol {
  id: string;
  householdId: string;
  userId: string;
  name: string;                            // "Healing stack"
  description?: string;
  active: boolean;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProtocolItem {
  id: string;
  protocolId: string;
  itemId: string;                          // InventoryItem
  doseAmount: number;
  doseUnit: DoseUnit;
  method: AdministrationMethod;
  rrule: string;                           // RFC-5545 RRULE string
  cycle?: { onDays: number; offDays: number } | null;
  preferredBatchId?: string;               // soft hint, not enforced
  notesMd?: string;
}

export interface DoseSchedule {            // a concrete upcoming occurrence
  id: string;
  householdId: string;
  userId: string;
  protocolItemId?: string;                 // optional — schedules can be ad-hoc
  itemId: string;
  scheduledFor: string;                    // ISO with offset
  doseAmount: number;
  doseUnit: DoseUnit;
  method: AdministrationMethod;
  status: 'pending' | 'logged' | 'skipped' | 'missed';
  doseLogId?: string;                      // set when logged
}

// ─── Logs & Adjustments ──────────────────────────────────────
export type AdministrationMethod =
  | 'subq' | 'im' | 'iv' | 'oral' | 'sublingual' | 'nasal' | 'topical' | 'inhaled' | 'other';

export type InjectionSite =
  | 'abd_ul' | 'abd_ur' | 'abd_ll' | 'abd_lr'
  | 'thigh_l' | 'thigh_r' | 'glute_l' | 'glute_r'
  | 'delt_l' | 'delt_r' | 'other';

export interface DoseLog {
  id: string;
  householdId: string;
  userId: string;
  itemId: string;
  batchId?: string;                        // resolved at log time
  doseAmount: number;
  doseUnit: DoseUnit;
  method: AdministrationMethod;
  injectionSite?: InjectionSite;
  takenAt: string;
  notesMd?: string;
  sideEffects?: string[];
  tags?: string[];
  scheduleId?: string;
  protocolId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface InventoryAdjustment {     // append-only ledger
  id: string;
  householdId: string;
  batchId: string;
  delta: number;                           // negative = consumed, positive = added
  unit: InventoryBatch['initialQuantityUnit'];
  reason: 'dose_log' | 'reconstitution' | 'discard' | 'manual_correction' | 'spillage' | 'gift';
  refDoseLogId?: string;
  byUserId: string;
  notesMd?: string;
  createdAt: string;
}

// ─── Custom metrics ──────────────────────────────────────────
export interface CustomMetric {
  id: string;
  householdId: string;
  userId: string;                          // metrics are per-user
  name: string;                            // "Sleep score"
  unit?: string;                           // "h", "/10", "kg"
  type: 'number' | 'scale_1_10' | 'boolean' | 'text';
  archived: boolean;
}

export interface MetricLog {
  id: string;
  householdId: string;
  userId: string;
  metricId: string;
  value: number | boolean | string;
  recordedAt: string;
  notesMd?: string;
}

// ─── Calendar ────────────────────────────────────────────────
export type CalendarPrivacy = 'full' | 'generic' | 'minimal';

export interface CalendarFeedSettings {
  id: string;
  householdId: string;
  scope: 'household' | 'user';
  userId?: string;                         // present iff scope='user'
  enabled: boolean;
  privacy: CalendarPrivacy;
  includeDose: boolean;
  includeProtocolName: boolean;
  includeProductName: boolean;
  includeReminders: boolean;
  reminderMinutesBefore?: number[];        // e.g. [10, 60]
  feedToken?: string;                      // present once hosted feed exists
  feedTokenIssuedAt?: string;
  updatedAt: string;
}

export interface CalendarEventMapping {    // stable UID per recurring schedule
  id: string;
  householdId: string;
  scheduleId?: string;
  protocolItemId?: string;
  uid: string;                             // "{id}@peptide-tracker.local"
  lastExportedSummary?: string;
  lastExportedAt?: string;
}

export interface CalendarExportHistory {
  id: string;
  householdId: string;
  exportedAt: string;
  scope: 'household' | 'user';
  userId?: string;
  privacy: CalendarPrivacy;
  eventCount: number;
  sha256: string;                          // content hash for diffing
}

// ─── Helpers ─────────────────────────────────────────────────
export type MassUnit = 'mcg' | 'mg' | 'g' | 'IU';
export type DoseUnit = MassUnit | 'mL' | 'units' | 'capsules' | 'tablets' | 'drops' | 'sprays';
```

### 6.1 Relationships (ER overview)

- `Household 1—N UserProfile`
- `Household 1—N InventoryItem 1—N InventoryBatch`
- `InventoryBatch 0..1 ReconstitutionRecord`
- `UserProfile 1—N Protocol 1—N ProtocolItem N—1 InventoryItem`
- `ProtocolItem 1—N DoseSchedule 0..1 DoseLog 1—1 InventoryAdjustment`
- `UserProfile 1—N CustomMetric 1—N MetricLog`
- `Household 1—N CalendarFeedSettings`

---

## 7. Dosage Calculation Logic

All math lives in `domain/math/` as **pure functions** with branded types and Zod-validated inputs.

### 7.1 Reconstitution

```
concentration_mcg_per_mL = (vial_mass_mcg) / (diluent_volume_mL)
```
- Vial mass normalized to mcg internally (`mg → mcg × 1000`, `g → mcg × 1_000_000`).
- IU is product-specific and **not auto-converted to mass** — surfaced as a separate axis with explicit warning.

### 7.2 Dose volume from concentration

```
volume_mL = dose_mcg / concentration_mcg_per_mL
insulin_units = volume_mL * 100        // U-100 syringe; warn if user uses U-40 or U-500
```

### 7.3 Capsule / tablet count

```
count = dose_amount / per_unit_strength_amount   (same unit on both sides)
```

### 7.4 Drops / sprays

```
actuations = dose_amount / per_actuation_strength
volume_mL  = actuations * actuation_volume_mL
```

### 7.5 Unit conversion table (internal canonical = mcg for mass)

| From | To | Factor |
|---|---|---|
| g | mcg | × 1,000,000 |
| mg | mcg | × 1,000 |
| mcg | mg | ÷ 1,000 |
| mL (concentration aware) | mcg | × concentration |
| insulin units (U-100) | mL | × 0.01 |

### 7.6 Edge cases & validation

- Division by zero (zero diluent, zero concentration) → `MathError`.
- Negative inputs → reject at Zod boundary.
- Mass↔volume conversion **requires** a concentration in scope; otherwise compile/runtime error.
- Concentration result rounded for display only — internal numbers kept as `number` with explicit precision rules; never stringify mid-calc.
- Floating-point: use a tiny `roundTo(decimals)` helper; never trust `(0.1 + 0.2)`.
- Cross-unit assertion: if `ProtocolItem.doseUnit` is `mL` but `InventoryBatch` has no concentration, calculator refuses and shows fix-up.

### 7.7 Worked examples (used as test fixtures)

1. **BPC-157 5mg vial + 2mL BAC water; dose 250mcg**
   - Conc = 5,000,000 mcg / 2 mL = 2,500,000 mcg/mL → 2.5 mg/mL.
   - Volume = 250 / 2,500,000 mcg/mL = 0.0001 L = **0.1 mL = 10 insulin units (U-100)**.
2. **TB-500 10mg + 5mL BAC; dose 2mg**
   - Conc = 2 mg/mL. Volume = 2 / 2 = **1 mL = 100 units (U-100)**.
3. **Berberine 500mg capsules; dose 1500mg** → **3 capsules**.

### 7.8 UX safety warnings

- Big "**mcg ≠ mg**" toast when the user types a number that crosses a typical boundary (e.g., 250 with selected unit `mg` for a peptide that's almost always mcg in this app's logs).
- Red-bordered warning card if calculator output > previous max for this product by 2×.
- Concentration mismatch banner if a user logs a dose against a batch whose reconstitution differs from the protocol's preferred batch.
- Expired/discard-by passed → vial picker shows a strikethrough with override-with-confirm.

---

## 8. UX Plan

### 8.1 Information architecture

Bottom nav (mobile) / left rail (desktop):
1. **Today** (dashboard / log)
2. **Inventory**
3. **Protocols**
4. **Insights**
5. **Settings**

Top bar: household name, **user switcher pill**, quick-add (+) button.

### 8.2 Dashboard ("Today")

- Greeting + active user ("Alex's day").
- **Today's doses** card — checklist of `pending` schedules → swipe-to-log / skip.
- **Inventory warnings** card — expiring soon (< 14d), low (forecast < 7d), discard-by passed.
- **Burn-down** card — stacked sparklines per active protocol's products.
- **Recent activity** — last 5 dose logs, with undo.
- **Active protocols** — chips → tap to view.
- Empty state: friendly onboarding tasks (add user, add first product, build first protocol).

### 8.3 Inventory

- Grouped list: by **form** then **status** (default), or by location, vendor, expiry.
- Card shows: name, remaining (visual fill bar), days-left forecast, expiry, status pill.
- Detail sheet:
  - Tabs: Overview / Reconstitution / History / Notes
  - Reconstitute action → opens calculator pre-filled.
  - Discard / mark empty / adjust manually.
- Add flow: 2-step (Item template, then Batch).

### 8.4 Calculator

- Tabs: **Reconstitute / Dose / Conversion**.
- Always-visible "Show your work" panel.
- Save as preset → tied to InventoryItem.
- Big result tile with primary unit + secondary unit chips (mL → also units, drops, etc.).
- Persistent disclaimer at the bottom.

### 8.5 Protocol builder

- Stepper:
  1. Name + user + dates.
  2. Add items (product, dose, schedule).
  3. Cycles & rest.
  4. Review & activate.
- Schedule input: simplified picker (Daily, Mon/Wed/Fri, Custom RRULE) — RRULE shown raw for power users.
- "Forecast" panel: depletion date for each linked batch.

### 8.6 Dose logging flow

- From Today's card: tap row → confirm sheet (1 thumb tap).
- Manual log: + → user → product → batch (auto-suggested) → dose → method → site (if injectable) → save.
- After save: success toast with **Undo** for 8 seconds (rolls back ledger entry).

### 8.7 Reports / Insights

- Adherence ring + 30/90 day trend.
- Inventory burn-down line chart.
- Custom metric line charts.
- Export PDF (print-stylesheet) / CSV / JSON.

### 8.8 Mobile considerations

- Bottom-nav, 44pt+ tap targets, swipe gestures.
- iOS safe-area aware; "Add to Home Screen" prompt after first dose log.
- Avoid number-keyboard quirks: input mode `decimal`, custom unit chips outside the input.
- Site-rotation body diagram → SVG with zoom.
- Dark mode via `prefers-color-scheme` + manual override.

---

## 9. Implementation Plan

### 9.1 Milestones

| # | Name | Output |
|---|---|---|
| M0 | Scaffolding | Vite+React+TS+Tailwind+shadcn, routing, theme, base layout, disclaimer modal. Wrangler-ready. |
| M1 | Domain core | All Zod schemas, math/, scheduling/, ical/ — fully unit-tested. Pure TS, runs in browser AND Workers. |
| M2 | Local persistence | Dexie schema + migrations + repositories + outbox table. JSON export/import. |
| M3 | Cloudflare backend | D1 schema mirroring Dexie; Drizzle types; Worker `/sync/pull`, `/sync/push` endpoints; Access JWT verification middleware; tenant-isolation helper. Tests via miniflare. |
| M4 | Sync client | Outbox drain, pull-merge with last-write-wins on `updated_at`, online/offline indicator, conflict log. |
| M5 | Inventory UI | CRUD for items/batches/supplies, reconstitution flow. |
| M6 | Calculators UI | Reconstitute / Dose / Conversion wired to M1. |
| M7 | Users & Protocols | User switcher, protocol builder, schedule expansion. |
| M8 | Logging & Dashboard | Today screen, log flow, ledger, undo, history. |
| M9 | Calendar | Hosted feed Worker (`/feed/...`), HMAC tokens, rotate UI, ICS download, privacy modes. |
| M10 | Insights | Adherence, burn-down, custom metrics, PDF/CSV export. |
| M11 | PWA polish & QA | Service worker, install prompts, empty states, error boundaries, a11y, Playwright E2E (incl. offline + sync round-trip + ICS subscribe). |

### 9.2 Folder structure (monorepo, single deployable)

```
peptide-tracker/
├─ packages/
│  ├─ domain/                 # PURE TS — imported by both web and worker
│  │  ├─ src/
│  │  │  ├─ schemas/          # Zod + branded types
│  │  │  ├─ math/             # reconstitution, dose, units
│  │  │  ├─ scheduling/       # RRULE expansion
│  │  │  ├─ inventory/        # ledger semantics
│  │  │  └─ ical/             # generator (used in browser AND Worker)
│  │  └─ package.json
│  ├─ web/                    # the React PWA (deployed via Pages)
│  │  ├─ public/
│  │  │  ├─ icons/
│  │  │  └─ manifest.webmanifest
│  │  ├─ src/
│  │  │  ├─ app/              # routing, providers, layout
│  │  │  ├─ pages/            # today, inventory, calculator, protocols, insights, settings
│  │  │  ├─ components/
│  │  │  ├─ features/         # vertical slices
│  │  │  ├─ db/               # Dexie schema, migrations, repositories
│  │  │  ├─ sync/             # outbox + pull/push client
│  │  │  ├─ stores/           # zustand UI state
│  │  │  └─ lib/
│  │  ├─ tests/               # Playwright E2E
│  │  └─ vite.config.ts
│  └─ worker/                 # Cloudflare Worker (deployed via wrangler)
│     ├─ src/
│     │  ├─ routes/
│     │  │  ├─ sync.ts        # /sync/pull, /sync/push
│     │  │  └─ feed.ts        # /feed/user/:id.ics, /feed/household/:id.ics
│     │  ├─ db/               # Drizzle schema mirrors domain/schemas
│     │  ├─ auth/             # Access JWT verification
│     │  ├─ tenant.ts         # household_id resolver + scoped query helper
│     │  └─ index.ts          # router
│     ├─ migrations/          # D1 SQL migrations
│     └─ wrangler.toml
├─ package.json               # workspace root
└─ pnpm-workspace.yaml
```

### 9.3 Libraries (locked)

**Web:**
- `react`, `react-dom`, `react-router-dom`
- `tailwindcss`, `@radix-ui/*`, `class-variance-authority`, `lucide-react`
- `dexie`, `dexie-react-hooks`
- `zustand`, `@tanstack/react-query`
- `react-hook-form`, `zod`, `@hookform/resolvers`
- `date-fns`, `rrule`
- `ics`
- `recharts`
- `vite-plugin-pwa`, `workbox-*`

**Worker:**
- `hono` (small router, fits Workers idiomatically)
- `drizzle-orm` + `drizzle-orm/d1`
- `zod` (shared with domain)
- `@tsndr/cloudflare-worker-jwt` for Access token verification
- `ics`

**Dev:**
- `vitest`, `@testing-library/react`, `@playwright/test`
- `miniflare` / `@cloudflare/vitest-pool-workers` for Worker tests
- `wrangler`
- `eslint`, `typescript-eslint`, `prettier`
- `fast-check` for property tests

### 9.4 Testing strategy

- **Unit (Vitest)** — every function in `domain/math/` and `domain/scheduling/` and `domain/ical/` ≥ 95% line coverage. Use property-based tests (`fast-check`) for unit conversions (round-trip identity).
- **Integration** — repositories against an in-memory Dexie (fake-indexeddb).
- **Component (RTL)** — calculator, log flow, protocol builder.
- **E2E (Playwright)** — install PWA, full happy path, offline reload, JSON round-trip, ICS export validates against a parser.
- **Snapshot** — generated `.ics` strings (line-ending normalized).

### 9.5 Validation strategy

- Zod schemas authored in `domain/schemas/`. Exported types are `z.infer`.
- All boundaries (forms, JSON import, sync inbound) call `.parse()` → throws on bad data.
- Branded types for `Mcg`, `Ml`, `InsulinUnits` etc. — math functions only accept branded inputs.

### 9.6 Backup / export / import strategy

- One JSON file format `peptide-tracker.export.v1.json`, top-level: `{ version, exportedAt, household, users, items, batches, ..., adjustments, ..., calendar }`.
- Hash (SHA-256 of canonicalized payload) included; verified on import.
- Import modes: `replace` | `merge_by_id` | `merge_by_id_take_newer`.
- Auto-export reminder banner every 14 days if no export taken.

---

## 10. Privacy and Security

### 10.1 v1 baseline (built in)

- **TLS** end-to-end (Cloudflare).
- **Cloudflare Access** at the edge — only invited household members can reach the app at all. Brute force, scraping, and casual tampering all stop here.
- **D1 at-rest encryption** (Cloudflare-managed).
- **Tenant isolation**: every Worker query goes through `withTenant(c)`; ESLint rule forbids raw D1 queries that don't filter by `household_id`.
- **HMAC-signed, revocable tokens** for ICS feed URLs; tokens never grant write access.
- **CSP + Permissions-Policy** headers set on Pages.
- **JSON export** for full data ownership / portability at any time.

### 10.2 Local encryption (v1.5, optional)

The local Dexie cache contains a copy of cloud data. For shared/family devices:

- Optional **passphrase lock** at app level.
- Derive key with **PBKDF2-SHA256** (200k+ iters) from passphrase + per-install salt.
- Encrypt sensitive fields (notes, dose logs) with **AES-GCM** before writing to IDB; indexed fields stay plaintext for queries.
- Auto-lock after N minutes inactivity. Lost passphrase = locked local cache (cloud data unaffected).

### 10.3 PIN / quick-unlock (v1.5)

- Optional 6-digit PIN that unwraps the passphrase-derived key from a WebAuthn-backed key on supported devices, falling back to a PBKDF2-derived wrap on others.

### 10.4 Export protection

- JSON export prompt: "Encrypt with passphrase? (recommended)".
- Encrypted exports use AES-GCM + magic header (`PTREXP01`).

### 10.5 Cloud-sync residual risks

- **Cloudflare itself** sees encrypted traffic and at-rest encrypted blobs but holds the keys; it can technically access your data. Treat this as equivalent to any other SaaS provider — fine for personal-use household data, **not** appropriate if you ever store real-patient PHI.
- **Token leak** in URL → ICS feed exposed. Mitigation: opaque tokens, per-feed scope, rotation, default to `Generic` privacy.
- **Access misconfig** → strangers reach the app. Mitigation: explicit allowlist of emails in Access policy + alerting on policy changes.

### 10.6 Going fully private (escape hatch)

If you ever need to remove cloud entirely: swap the Worker URL for empty / disable in Settings. The app falls back to local-only Dexie, JSON exports become the sync mechanism. No code change required — the sync adapter already supports a no-op mode.

---

## 11. Future Commercialization Path

### 11.1 What changes for SaaS (most plumbing already in place)

- **Auth**: swap Cloudflare Access (good for a closed household) for an embedded auth provider — **Auth.js (NextAuth) on a Worker**, **Clerk** (free up to 10k MAU), or **WorkOS** for B2B. Same JWT contract; the tenant resolver doesn't change.
- **Households become tenants**: invite flow with 6-digit codes; the existing `household_id` partitioning becomes the multi-tenant boundary verbatim.
- **Storage scaling path**: D1 → Cloudflare Hyperdrive-fronted Postgres (Neon) when household count grows past D1's per-DB write ceiling, OR shard by household across many D1 databases (D1 supports this natively). Drizzle abstracts the dialect.
- **Billing**: Stripe Customer Portal, household-tier subscription; free tier capped at 1 user / 5 products / no hosted feed.
- **Notifications**: Worker cron triggers + Web Push for missed-dose nudges; SES/Resend for email digest fallback.
- **Audit**: D1 already has the `inventoryAdjustments` ledger; add a generic `audit_events` table keyed by `household_id`.

### 11.2 Compliance considerations

- This is **not a medical device** as designed. Avoid features that cross into SaMD (e.g., recommending doses, calculating allergy/interaction warnings, claiming therapeutic effect). Document this explicitly.
- **HIPAA**: only relevant if you market to clinicians or accept PHI under a BAA — avoid by positioning as a personal wellness tool. Add a TOS clause that the product is not for clinical use.
- **GDPR/CCPA**: data export + delete endpoints (already free from your JSON export design). Data residency: pick Supabase region per tenant if EU customers appear.
- **App Store distribution (later)**: Capacitor wrapper. Apple's supplement/peptide review can be conservative — frame as a journaling tool.

### 11.3 Database migration path

D1 → bigger relational store happens once but doesn't touch the domain layer:
1. Provision Neon Postgres (or Azure SQL if you want the Azure ecosystem).
2. `drizzle-kit` generates the Postgres DDL from the same schema definition (one dialect flag flip).
3. One-time export from D1 (`wrangler d1 export`) → load into Postgres.
4. Update the Worker `db` binding; redeploy.

**No domain code changes.** That's the payoff of the framework-free domain layer + Drizzle.

---

## 12. Claude Implementation Prompt Sequence

Each prompt below is ready to paste into a fresh Claude Code session. They build on each other — run M0 first, then M1, etc. Every prompt explicitly forbids medical advice and hardcoded dosing.

### Global system preamble (paste at top of every milestone prompt)

> You are implementing a personal peptide/enzyme tracker. **Critical rules**, do not break:
> 1. Never embed dosage recommendations, "safe ranges," or drug-specific clinical guidance. The user supplies all protocols.
> 2. Never include lookup tables, presets, or seed data with real peptide names + doses.
> 3. Add a disclaimer comment at the top of every domain math file: *"This file performs unit math only. It does not advise on dose safety. The user is responsible for their own protocol."*
> 4. All dose math must have unit tests. All inventory deductions must have unit tests. Property-based tests for unit conversions are required.
> 5. The domain layer (`src/domain/**`) must be framework-free pure TypeScript — no React, no Dexie, no DOM.
> 6. Use Zod at all boundaries (forms, JSON import, sync). Branded types for `Mcg`, `Mg`, `Ml`, `InsulinUnits`.
> 7. Show the math: every calculator UI surfaces the formula and the inputs used.

### M0 — Scaffolding
> Create a pnpm workspace monorepo with three packages: `domain`, `web`, `worker`. In `web`, scaffold Vite + React + TypeScript, Tailwind v4, shadcn/ui (Button, Card, Dialog, Input, Select, Tabs, Toast, Sheet, DropdownMenu), Lucide icons, React Router (BrowserRouter), Zustand, TanStack Query, react-hook-form, Zod, date-fns, rrule. In `worker`, scaffold a Cloudflare Worker with Hono, Drizzle, `wrangler.toml` referencing a D1 binding `DB`, and a placeholder `/health` route. Set up `pnpm dev` to run both web and `wrangler dev` concurrently. Build the base web layout with bottom nav (Today / Inventory / Protocols / Insights / Settings) and a top bar with user-switcher placeholder. Add a permanent footer disclaimer + first-run consent modal stored in IndexedDB. Configure ESLint, Prettier, Vitest, Playwright, miniflare. Add a `README.md` with the global rules from the preamble. **Do not implement features.**

### M1 — Domain core (shared package)
> In `packages/domain/src/`, implement: (a) Zod schemas for every entity in the data model section of the plan, (b) branded mass/volume types and unit conversion helpers, (c) reconstitution + dose-volume + capsule + drop/spray calculators as pure functions, (d) RRULE-based occurrence expansion, (e) a pure ICS generator that produces RFC-5545-valid output for an array of occurrences with privacy mode `full|generic|minimal`. The package must have **zero runtime dependencies on React, Dexie, Drizzle, or any platform**. Configure it as an internal workspace dep imported by both `web` and `worker`. **Write Vitest tests including property-based tests (`fast-check`) for round-trip unit conversions** and the three worked examples in the plan. Add the disclaimer comment header on every math file.

### M2 — Local persistence (web)
> In `packages/web/src/db/`, add Dexie. Define the schema mirroring the Zod types from `domain` (use the same field names). Implement migration v1. Add an `outbox` table holding pending mutations as `{ id, op, payload, createdAt }`. Build typed repositories for each aggregate: HouseholdRepo, UserRepo, InventoryItemRepo, BatchRepo, SupplyRepo, ProtocolRepo, ScheduleRepo, DoseLogRepo (also writes ledger), AdjustmentRepo, MetricRepo, CalendarSettingsRepo. **Every mutating repository call writes both the row and an outbox entry in a single Dexie transaction.** Inventory deduction must always go through DoseLogRepo.create() which writes the DoseLog + InventoryAdjustment + outbox entries atomically. Add JSON export (with SHA-256) and import (replace / merge-by-id / merge-take-newer modes). Test repositories against `fake-indexeddb`. Test atomicity and Undo reversal.

### M3 — Cloudflare backend (worker + D1)
> In `packages/worker/`: create a Drizzle schema mirroring the domain Zod types — same field names, same nullability. Add D1 migration `0001_init.sql` generated by `drizzle-kit`. Add Hono routes: `GET /sync/pull?since=…` returns rows where `updated_at > since` for the caller's `household_id`; `POST /sync/push` accepts an array of upserts and applies last-write-wins on `updated_at`. Implement Cloudflare Access JWT verification middleware that resolves `email → user_id → household_id`. Implement a `withTenant(c)` helper that **must wrap every D1 query** and prevents queries that don't filter by `household_id` (lint via a custom ESLint rule + runtime guard). Test all routes with miniflare. **Never trust client-supplied `household_id`.**

### M4 — Sync client
> In `packages/web/src/sync/`: implement an outbox drainer that POSTs to `/sync/push` in batches with retry + exponential backoff. Implement a puller that calls `/sync/pull` on app focus / interval / online event and merges by `updated_at` (server wins on tie). Show online/offline state in the top bar. Persist the last-pulled cursor. Provide a "force pull" button in Settings. Tests: simulate offline mutations, come online, verify server convergence; simulate two devices push-merging.

### M5 — Inventory UI
> Build Inventory listing (grouped by form/status), filtering, item template create/edit, batch create/edit (linked to template), reconstitution flow that opens the calculator from M1 and writes a `ReconstitutionRecord`. Implement status state machine. Show forecast remaining doses based on active schedules. Use shadcn Sheet for detail panels on mobile. **No medical-claim copy anywhere. No seed data of real peptides — use generic placeholders ("Sample peptide A").**

### M6 — Calculator UI
> Build the Calculator page with tabs Reconstitute / Dose / Conversion. Wire to M1 functions. Implement the "Show your work" panel. Implement preset save/load tied to InventoryItem. Add the unit-mismatch and "result > 2× previous max" warnings. Big disclaimer footer on this page.

### M7 — Users & Protocols
> Implement user CRUD and the user switcher. Implement Protocol builder stepper. Expand `ProtocolItem.rrule` into `DoseSchedule` rows for the next 60 days, refresh on protocol change. Show projected depletion per linked batch. Tests for RRULE expansion edge cases (DST, cycle on/off, end-of-month).

### M8 — Logging & Dashboard
> Implement the Today screen and the dose-logging flow. Tap a pending schedule to log/skip/miss. Manual log path. Inventory deduction via M2. 8-second Undo toast that reverses the ledger entry (and emits a compensating outbox op). Dashboard cards: today's doses, inventory warnings (expiring < 14d, low forecast < 7d, discard-by passed), burn-down sparklines, recent activity, active protocols. Empty states.

### M9 — Calendar (download + hosted feed)
> Implement Calendar Settings: per-user and per-household feeds, privacy modes (`full`/`generic`/`minimal`), include-dose / include-product / include-protocol toggles, reminder offsets. Wire `.ics` download in the web app using `domain/ical`. In the Worker, add `GET /feed/user/:userId.ics?token=…` and `GET /feed/household/:householdId.ics?token=…`: validate HMAC token (signed with a Worker secret), load the relevant schedules from D1, render with the same `domain/ical/generate.ts` import, return with `ETag` + `Cache-Control: max-age=900`. Add Settings UI to issue + revoke + rotate tokens. Test ICS output against an RFC-5545 parser and round-trip a generated feed through Apple Calendar / Google Calendar in manual QA.

### M10 — Insights
> Adherence ring + 30/90-day trend. Inventory burn-down line chart. Custom metrics CRUD + line charts. PDF export (print stylesheet) and CSV/JSON export per user. **No clinical interpretation, no green/red outcome judgments, no "good/bad" labels.**

### M11 — PWA polish & QA
> Add `vite-plugin-pwa` with offline app shell. Manifest icons. Add error boundaries on each page. Empty states with calls-to-action. a11y pass: keyboard nav, focus rings, ARIA on the body-diagram SVG, color-contrast in dark mode. Playwright E2E covering: first-run consent, create user/item/batch, reconstitute, build a protocol, log a dose, see inventory drop, export+re-import JSON, install PWA, offline reload, mutate offline → come online → see server convergence, generate ICS and re-import into the app to verify round-trip stability of UIDs, subscribe to hosted feed and verify a calendar app polls successfully.

---

## 13. Verification

End-to-end checks once M0–M11 ship:

1. `pnpm test` — all unit + Worker tests pass; coverage report shows `packages/domain/src/math` and `packages/domain/src/scheduling` ≥ 95%.
2. `pnpm test:e2e` — Playwright happy path + offline reload + sync convergence + ICS round-trip pass.
3. `pnpm build` then deploy via `wrangler pages deploy` and `wrangler deploy` (worker). Open in mobile device, sign in via Cloudflare Access, Add to Home Screen. Confirm:
   - Onboarding consent appears.
   - Create a household / 2 users / 1 item / 1 batch / 1 protocol → 7 days of schedules appear.
   - Log a dose from Today; inventory drops; Undo restores.
   - Open the same household on a second device — see the same data within seconds (sync working).
   - Mutate offline on device A → reconnect → device B sees the change after pull.
   - Settings → Calendar → enable hosted feed → copy URL → subscribe in Apple Calendar / Google Calendar / Outlook → events visible. Rotate token → old URL 404s.
   - Settings → Export → import into a fresh browser profile → state restored byte-identical.
4. Lighthouse PWA audit ≥ 90.
5. Manual review: search the codebase for the words "recommended dose", "max dose", "safe range" — must return zero hits in source code.
6. Worker security check: every D1 query is wrapped in `withTenant()`; ESLint passes the custom rule; manual attempt to call `/sync/pull` with a forged Access JWT is rejected.

---

## 14. Critical files (paths to be created)

**Shared domain:**
- `packages/domain/src/schemas/index.ts` — Zod schemas + branded types.
- `packages/domain/src/math/reconstitution.ts`
- `packages/domain/src/math/dose.ts`
- `packages/domain/src/math/units.ts`
- `packages/domain/src/scheduling/expand.ts`
- `packages/domain/src/inventory/ledger.ts`
- `packages/domain/src/ical/generate.ts`

**Web (PWA):**
- `packages/web/src/db/schema.ts`, `packages/web/src/db/migrations/v1.ts`
- `packages/web/src/db/repositories/*.ts`
- `packages/web/src/sync/outbox.ts`, `packages/web/src/sync/puller.ts`
- `packages/web/src/features/calendar/exportIcs.ts`
- `packages/web/src/pages/today/TodayPage.tsx`
- `packages/web/src/pages/calculator/CalculatorPage.tsx`
- `packages/web/src/pages/inventory/InventoryPage.tsx`
- `packages/web/src/pages/protocols/ProtocolBuilder.tsx`
- `packages/web/src/pages/settings/CalendarSettings.tsx`
- `packages/web/public/manifest.webmanifest`
- `packages/web/vite.config.ts` (with `vite-plugin-pwa`)

**Worker (API + ICS feeds):**
- `packages/worker/wrangler.toml`
- `packages/worker/src/index.ts` (Hono router)
- `packages/worker/src/routes/sync.ts`
- `packages/worker/src/routes/feed.ts`
- `packages/worker/src/auth/access.ts` (JWT verify)
- `packages/worker/src/tenant.ts` (`withTenant`, scoped query helper)
- `packages/worker/src/db/schema.ts` (Drizzle, mirrors domain)
- `packages/worker/migrations/0001_init.sql`

**Root:**
- `pnpm-workspace.yaml`, `package.json`
- `README.md` (rules + run/deploy instructions)

---

## 15. Decisions made

| # | Decision | Rationale |
|---|---|---|
| 1 | **Cloudflare Pages + Workers + D1 + Access** end-to-end | Free tier covers a household forever; no idle pause; D1's SQLite mirrors Dexie 1:1; Access provides free auth for ≤50 users; live ICS feeds drop in for free. |
| 2 | **Encryption deferred to v1.5** | TLS + Access + D1 at-rest is sufficient for private household data. App-level passphrase adds friction for marginal benefit. |
| 3 | **Live cloud sync from v1**, JSON export as backup | Multi-device household sharing was a stated requirement. Cloudflare makes this free. Manual JSON-only would be a significant downgrade. |
| 4 | **Last-write-wins by `updated_at` for v1**, CRDT only if needed | A 2-4 person household rarely conflicts. CRDTs add complexity; defer until evidence demands it. |
| 5 | **ICS via RRULE (one VEVENT per recurring schedule)** | Smaller payloads, friendlier to calendar clients' refresh logic. Switch to per-occurrence VEVENTs if exception handling proves painful. |
| 6 | **Azure deferred** | Cosmos DB free tier is generous but the document model fights the relational shape we want. Azure SQL + SWA is viable but adds a second control plane vs Cloudflare-everywhere. Easy to revisit when commercializing. |
