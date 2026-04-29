<!-- /autoplan restore point: /c/Users/amlan/.gstack/projects/peptide-tracker/main-autoplan-restore-20260428-165519.md -->
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

---

# AUTOPLAN REVIEW

> Generated: 2026-04-28 | Branch: main | Commit: a8b57bd
> Mode: SELECTIVE_EXPANSION (overridden by dual-voice consensus → see Premise Gate)

---

## Phase 1 — CEO Review

### Step 0A — Premise Challenge

The plan rests on five load-bearing premises. Three of them did not survive dual-voice review.

| # | Premise as stated | Evidence cited | Verdict |
|---|---|---|---|
| P1 | A 2-person household has a real *sync* problem worth solving | None — asserted in §1 + §2 | **REJECTED** by both voices. Likely actual problem is habit-formation, not sync. |
| P2 | "SaaS-readiness from v1" is near-zero cost | Implied by §11 framing | **REJECTED** by both voices. Cost is real: every infra choice is a v1 tax. |
| P3 | Peptides are commercializable if you avoid medical-claim wording | §11.2 "frame as journaling tool" | **REJECTED** by both voices. The blockers are Stripe underwriting, App Store review, Meta/Google ad policies — none of which are wording problems. |
| P4 | The user will still be using this in 6 months | Implicit | **UNTESTED.** No falsification criterion in plan. |
| P5 | Tracking-only positioning is a sufficient legal shield | §7 + §11.2 | **PARTIALLY VALID** for personal use; weak shield for commercial distribution. |

### Step 0B — Existing Code Leverage Map

| Sub-problem | Existing solution | Reuse possible? |
|---|---|---|
| Reconstitution math | Peptide.do, PeptideCalculator.com (both free, calculator-only) | YES — reference UX, but no API to embed. |
| Dose journaling | Bearable, Cronometer, MyFitnessPal supplement log | NO — none handle reconstitution; this is the genuine wedge. |
| Calendar reminders | Apple/Google native calendar, Reminders apps | YES — `.ics` export works; hosted feed is overengineering for 2 users. |
| Inventory burn-down | Spreadsheets (Reddit r/Peptides templates), Notion templates | YES — most users currently use these. Replacing them is the value prop. |
| Multi-user shared state | Shared Apple Notes, shared spreadsheet, shared whiteboard | YES — these solve the actual household coordination need at zero engineering cost. |

**Greenfield code starts at zero.** The leverage opportunity is *not building things competitors already do well*. Reconstitution + ledger is the unique value.

### Step 0C — Dream State

```
CURRENT (no app exists)
  → spreadsheet, mental math, whiteboard
THIS PLAN as written (M0-M11)
  → architectural masterpiece serving 2 humans, 6 months of build
  → high probability the user stops logging before the Worker ships
12-MONTH IDEAL (per dual-voice critique)
  → first dose logged in week 1
  → 6 weeks of personal usage data
  → kill-or-expand decision based on actual behavior
  → if expand: clinician-facing or calculator-first, not consumer peptide SaaS
```

### Step 0C-bis — Implementation Alternatives

| Approach | Effort (CC) | Risk | Pros | Cons | Reuses |
|---|---|---|---|---|---|
| **A. Plan as written** (Cloudflare-everywhere, 11 milestones, live sync, hosted ICS, Access auth) | 4-6 weekends | High (overbuilding for 2 users) | SaaS-ready; multi-device; hosted feeds; full architectural elegance | Defers first-logged-dose by ~8 milestones; sunk-cost distortion when habit fails | Cloudflare ecosystem |
| **B. Single-user-first MVP** (Pages + Dexie + JSON export + downloadable .ics; no Worker, no D1, no Access) — *RECOMMENDED by both voices* | 1-2 weekends | Low | First dose logged in week 1; cheapest validation; clean revert path; no infra to maintain | Defers household sync; sync becomes a future unlock, not v1 | Same Vite/Tailwind/Dexie/RRULE stack; identical domain layer ports forward |
| **C. Calculator-only first product** (`peptide-calc.app` style — reconstitution + dose math, no log, no inventory) | 1 weekend | Low | Defensible wedge isolated; shippable ad-hoc; tells you whether anyone wants more | Skips the user's actual stated need (logging + inventory) | Domain math + UI shell |

### Step 0D — Mode-specific scope analysis

Original mode: SELECTIVE_EXPANSION. After dual-voice review, the appropriate mode is **SCOPE REDUCTION** — both voices independently recommend cutting M3 (Worker), M4 (sync), and the Worker portion of M9 (hosted feed) from v1. Eight milestones become four.

### Step 0E — Temporal interrogation

| Hour | What the implementer needs | Plan-as-written answer | Plan-B answer |
|---|---|---|---|
| HOUR 1 | "Where do I start?" | M0 scaffolding (3 packages, monorepo, two dev servers) | Single Vite app, `pnpm create vite` |
| HOUR 2-3 | "What's the simplest thing that produces value?" | Domain layer tests (8 milestones from logging) | Reconstitution calculator wired to a save-preset list |
| HOUR 4-5 | "Will my partner actually use this?" | Unanswerable — no UI for ~3 weekends | Already shippable to a phone via PWA install |
| HOUR 6+ | "What did I just build?" | Half a sync engine | A working dose log |

### Step 0F — Mode confirmation

Dual-voice consensus recommends switching from **SELECTIVE_EXPANSION → SCOPE REDUCTION**. This is a User Challenge (see Premise Gate below) — the user's call.

---

## CEO Dual Voices — Consensus Table

```
═══════════════════════════════════════════════════════════════════════
  Dimension                                Claude   Codex   Consensus
  ──────────────────────────────────────── ──────── ─────── ──────────
  1. Premises valid?                        NO       NO     CONFIRMED
  2. Right problem to solve?                NO       NO     CONFIRMED
  3. Scope calibration correct?             NO       NO     CONFIRMED
  4. Alternatives sufficiently explored?    NO       NO     CONFIRMED
  5. Competitive/market risks covered?      NO       NO     CONFIRMED
  6. 6-month trajectory sound?              NO       NO     CONFIRMED
═══════════════════════════════════════════════════════════════════════
```

**6/6 dimensions agree the plan as written has problems.** Both voices flagged identical CRITICAL items independently:

- **CRITICAL** — Household sync is asserted, not validated. The real problem is likely habit formation.
- **CRITICAL** — "SaaS-readiness from v1" is not near-zero cost; it's a v1 tax.
- **CRITICAL** — Peptides-as-SaaS is structurally compromised (Stripe / App Store / Meta + Google ad policies). Wording fixes don't unblock.
- **HIGH** — Single-user-first and calculator-first alternatives were dismissed without analysis.
- **HIGH** — 11-milestone plan is future-justified overbuilding before user behavior is validated.

### CODEX SAYS (CEO — strategy challenge)

> [CRITICAL] "Household sync" is treated as a validated need when it is only asserted. For a two-person household, the dominant failure mode is usually not "we lacked multi-device sync"; it is "we never formed the habit of logging." You are optimizing for data consistency before proving repeated usage.
>
> [CRITICAL] "SaaS-readiness from v1 with minimal rewrite" is treated as almost free. It is not. SaaS difficulty here is not schema portability. It is distribution, payments risk, moderation/compliance burden, support overhead, legal positioning, and acquisition channel fragility.
>
> [CRITICAL] "Personal wellness tool" language will not neutralize platform risk if the product is obviously optimized for peptide administration. The relevant blockers are Stripe underwriting, app review interpretation, ad account restrictions, merchant account churn.
>
> [HIGH] The likely better framing is "high-friction dose math + inventory confidence for self-trackers" — generalizes across peptides, enzymes, supplements, compounded meds, vet/home dosing.
>
> [HIGH] The 11-milestone plan is classic future-justified overbuilding. You are planning sync engines and tenant boundaries before proving two people will log consistently for 30 days.
>
> Core blind spot: solving for a future investor narrative before proving a present user behavior.

### CLAUDE SUBAGENT (CEO — strategic independence)

> Verdict: **Reconsider scope.** Beautifully engineered plan for the wrong product.
>
> 1. [HIGH] Household sync solves a phantom requirement for 2 humans + 1 fridge.
> 2. [HIGH] Unstated premises baked into the plan (will keep using; partner will adopt; SaaS path exists).
> 3. [HIGH] 6-month regret scenario: full sync stack maintained for 1 user, partner stopped opening it after week 6.
> 4. [HIGH] Dismissed alternatives — single-user, calculator-only, clinician-facing, native mobile — none analyzed.
> 5. [MEDIUM] No competitive analysis — Peptide.do, PeptideCalculator, Bearable, Stack, Cronometer, Reddit templates.
> 6. [CRITICAL] Scope dramatically miscalibrated — 11 milestones for a 2-person household.
> 7. [CRITICAL] Peptide-as-SaaS commercialization trap (App Store, Stripe, Meta/Google ads, FDA enforcement on supplement-adjacent calculators).
> 8. [MEDIUM] Sync-as-feature anti-pattern — every successful personal tracker launched single-device.
>
> Single biggest blind spot: the plan optimizes for SaaS-future-proofing without ever validating the household has a tracking problem worth solving.

---

## Section 1 — Architecture Review

System design is internally consistent and the dependency graph is clean (see §4.2 in the plan). The domain layer being framework-free is the right call regardless of scope decision. The `withTenant()` enforcement pattern + ESLint rule is a strong tenant-isolation primitive **if** the plan keeps the multi-tenant boundary; under SCOPE_REDUCTION it becomes dead code. Single-points-of-failure: Cloudflare (hosting, edge auth, DB, ICS feed all on one vendor). Rollback procedure: not documented. **Issues:** dependency on Cloudflare Access creates lock-in proportional to how much auth code we *don't* write.

## Section 2 — Error & Rescue Map

Greenfield: no existing code to map. Forward-looking gaps the plan should address:

| METHOD/CODEPATH | WHAT CAN GO WRONG | EXCEPTION CLASS | RESCUED? | RESCUE ACTION | USER SEES |
|---|---|---|---|---|---|
| `DoseLogRepo.create()` | IDB transaction abort mid-write | `DexieError`/`AbortError` | **NOT YET** | retry once; if persistent, roll back UI optimistic update | "Couldn't save — try again" toast |
| Calculator dose math | Division by zero (no concentration) | `MathError` | spec'd in §7.6 | refuse + show fix-up | Red banner explaining unit need |
| ICS export | RRULE with no occurrences | `EmptyFeedError` | **NOT YET** | emit valid empty calendar | Silent (downloaded file is empty calendar) |
| Sync push | Worker 5xx during outbox drain | network error | **NOT YET** | exponential backoff, surface offline state | Top-bar offline indicator |
| Reconstitution | Vial volume = 0 | `MathError` | spec'd in §7.6 | refuse | Inline form error |

Plan should add explicit error-rescue specification for the listed gaps.

## Section 3 — Security & Threat Model

| Threat | Likelihood | Impact | Mitigation status |
|---|---|---|---|
| ICS feed token leak (URL in calendar metadata) | M | M (dose schedule exposure) | Spec'd: opaque, signed, rotatable. **Privacy mode default should be `Generic` not `Full`** — currently unstated. |
| Cloudflare Access misconfig (open allow-list) | L | H (full data exposure) | Plan mentions allowlist; **needs explicit "deny by default" instruction in deploy docs**. |
| XSS via user-entered notes (markdown) | M | M | **Unstated.** Plan needs to commit to a sanitizer (DOMPurify) for any rendered notesMd. |
| Stolen JSON export | L | M | Spec'd: optional passphrase encryption. Default-off; recommend default-on for export. |
| Dose-log replay / collision attack on `/sync/push` | L | L | LWW makes this benign; document as accepted risk. |

## Sections 4-11 — Summary

- **§4 Data Flow:** state machines (vial status, schedule status) implicit but unspecified — recommend ASCII diagrams in §6 of plan.
- **§5 Code Quality:** N/A (greenfield).
- **§6 Test Review:** see Phase 3 Eng.
- **§7 Performance:** Dexie queries unbounded by household size — fine for 2 users. Worker query patterns OK at edge. Charts in §6.7 will need pagination at >5k log entries (forecastable in 2 years).
- **§8 Observability:** **gap.** Plan has no logging/observability strategy. For a tracker users rely on, missed-dose silent failures must be visible somewhere.
- **§9 Deployment:** `wrangler deploy` only. **No staging env mentioned**, no rollback procedure, no DB migration testing path. Add §9.5 to plan.
- **§10 Long-Term Trajectory:** see Premise Gate below.
- **§11 Design & UX:** handed to Phase 2.

## Phase 1 — Failure Modes Registry

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES | LOGGED? | CRITICAL GAP? |
|---|---|---|---|---|---|---|
| Calculator unit mismatch (mg vs mcg) | Wrong dose 1000× off | Spec'd warning | TODO | Red warning before save | Should be | **YES — flagged in §7.8 as v1 must-have** |
| Vial expiry passed | User logs against expired vial | Spec'd override-with-confirm | TODO | Strikethrough + confirm modal | Should be | NO |
| Calendar feed token leak | Dose schedule exposed | Spec'd rotation | TODO | n/a (silent) | Should be | NO |
| Outbox stuck offline forever | Mutations never sync | Not spec'd | NO | **Currently invisible** | NO | **YES — silent failure** |
| Two devices with diverged batches | Inventory shows wrong remaining | LWW spec'd | TODO | Eventual consistency only | NO | NO (under SCOPE_REDUCTION this is moot) |

## Phase 1 — NOT in scope

- Computer-vision vial barcode scan (already deferred, §2 Risky/Cut)
- AI correlation insights (already deferred, §2)
- iOS native push reminders (best-effort PWA only)
- Multi-household / sharing across non-household users
- Real-time presence / "who is logging now"

## Phase 1 — What already exists

Greenfield project. The "exists" axis is the broader market, mapped in Step 0B above. No code to leverage in this repo.

## Phase 1 — Dream state delta

Plan-as-written **moves further** from the 12-month ideal: infrastructure-first sequencing means the kill-or-expand decision happens after sunk cost is high. Plan-B (single-user MVP) lands closer to the ideal — faster signal, cheaper to abandon, cleaner expansion path.

## Phase 1 — CEO Completion Summary

| Dimension | Result |
|---|---|
| Mode (proposed) | **SCOPE_REDUCTION** (overridden from SELECTIVE_EXPANSION by dual-voice consensus) |
| System audit | Internally consistent for the scope it states; scope itself is questioned |
| Step 0 decisions | 5 premises challenged, 3 rejected, 2 accepted with caveats |
| Sections 1-11 issues | 1 CRITICAL gap (silent sync failure), 4 HIGH gaps (XSS, observability, staging env, default privacy mode), several MEDIUM |
| NOT in scope (count) | 5 deferred items |
| Registries produced | Error & Rescue (5 rows), Failure Modes (5 rows, 2 critical) |
| Outside voices | Codex CEO ✓ + Claude subagent CEO ✓ |
| User Challenge raised | **YES — premise gate below** |

---

## PREMISE GATE — User Challenge (NOT auto-decided)

**Both voices independently recommend the user's stated v1 scope should change.** This is a User Challenge per autoplan rules and goes to the user, not auto-decision.

**You said:** v1 = Cloudflare Pages + Workers + D1 + Access + live sync + hosted ICS feeds + 11 milestones, SaaS-ready from day one.

**Both models recommend:** scope down to a single-user PWA with Dexie + JSON export + downloadable `.ics`. Defer Workers, D1, Access, hosted feeds, and SaaS-readiness work to v1.5+ — gated on actual usage data (e.g., "still logging after 6 weeks").

**Why:**
1. Household sync is asserted, not validated. The dominant failure mode for personal trackers is habit-formation, not sync.
2. "SaaS-readiness from v1" is a v1 tax, not free optionality. The actual SaaS blockers (Stripe / App Store / ads / FDA) are not architecture problems.
3. Peptide-SaaS commercialization is structurally compromised — payment processors, ad platforms, and app review will not yield to "personal wellness tool" framing.
4. 11 milestones defer the first-logged-dose moment by ~8 milestones. Sunk cost will distort the kill/keep decision.

**What we might be missing:**
- Your wife and you may genuinely have a daily multi-device coordination problem that JSON export can't solve. Models can't see this.
- You may have signed up for a strict household protocol (e.g., post-surgery rehab, shared peptide stack) where divergent inventory is dangerous. Models don't know.
- You may want this as a portfolio piece / SaaS practice run regardless of viability. That's a valid reason models can't weigh.
- Cloudflare-everywhere with the Worker may be more fun to build than a constrained MVP, and "fun to build" is a real reason to ship a real artifact.

**If we're wrong, the cost is:** you ship a single-user MVP, hit the household-sync wall in week 2, and rebuild M3+M4 on top — adding ~2 weekends of rework versus building it correctly from day one.

**If you're wrong, the cost is:** you spend 4-6 weekends on infrastructure for a workflow that you and your wife abandon by week 6, and the architectural elegance becomes a graveyard.

The user's original direction stands unless explicitly changed.

### PREMISE GATE — User Decision (recorded 2026-04-28)

**Q1 (v1 scope):** User overrode the dual-voice consensus. **Plan-as-written stands.** Cloudflare Pages + Workers + D1 + Access + live sync + hosted ICS feeds + 11 milestones remains v1.

**Q2 (§11 commercialization):** User clarified the SaaS framing. Updates to apply:
- "Commercialization" means **consumer signup for personal use only**, mirroring the user's own use case (a household tracking its own peptides). NOT B2B clinical, NOT clinics, NOT FDA-regulated facilities.
- No dose recommendations anywhere — already the plan's stance, reaffirmed.
- **NEW REQUIREMENT (added by user):** peptide *information as an educational/learning resource* for end users. Reference content (what each peptide is, mechanism, common research-literature half-life/route/side-effects, citations) without prescribing dose ranges.

### Resulting plan deltas (apply during implementation, not by autoplan)

1. **§11 Future Commercialization Path** — rewrite to position as consumer-personal-use SaaS only. Remove implicit B2B/clinical framing. Add explicit clauses: "Not for use in clinical settings, not for prescribing decisions, no dose recommendations." Acknowledge the residual platform-risk register honestly (Stripe/App Store/ads policies still apply regardless of personal-use framing) — keep the §10.5 honest-risk posture.
2. **NEW §3.10 — Education / Information module** (added to feature breakdown):
   - Per-product reference page: name, class, mechanism (1-paragraph), common research-literature half-life and route, commonly-reported side effects, citations to source studies (pubmed/doi links), legal/regulatory note (e.g., "Sold as research chemical in [jurisdictions]; consult a qualified medical professional").
   - **Hard rule:** no dose ranges. No "typical dose is X". Show study-reported doses *only as direct quotations* from cited studies, never as a UI-rendered "recommended" anything. The user enters their own protocol; the app does not suggest one.
   - Content source: curated by the user (markdown files in repo), versioned, contributor-friendly. v1 ships with ~10-20 commonly-tracked peptides; users can add their own.
   - Surfaced as: a tab on each `InventoryItem` detail view (Reference / History / Notes) and an Education section in main nav.
3. **Data model addition:** `EducationContent` entity (peptide_slug, name, class, mechanism_md, half_life_text, route, side_effects[], citations[], regulatory_note_md, last_updated). Sync via the same Cloudflare D1 (`household_id` is null for global content; falls back to seed content from a JSON shipped with the build).
4. **Audit trail rule:** every page that renders `EducationContent` must surface the disclaimer "This is educational reference, not medical advice. The user is responsible for their own protocol. No dose is recommended by this app."

Phase 2-3.5 below review the plan **with these deltas folded in**.

---

## Phase 2 — Design Review

### Step 0 — Design Scope

- Initial completeness: **3/10**. §8 is mostly an IA dump and bullet lists. No typography scale, no color tokens, no spacing rhythm, no motion language, no defined empty/error/loading/sync states, no actual desktop layout.
- DESIGN.md status: does not exist.
- Reuse map: locked stack is shadcn/ui + Radix + Tailwind v4 + Lucide + Recharts. This is the absolute industry default and will produce default-2026-SaaS-dashboard look without intentional intervention.

### Design Dual Voices — Consensus Table

```
═════════════════════════════════════════════════════════════════════════
  Dimension                                  Claude   Codex   Consensus
  ──────────────────────────────────────────  ──────── ─────── ──────────
  1. Information hierarchy serves the user?    NO       NO     CONFIRMED
  2. Interaction states fully specified?       NO       NO     CONFIRMED
  3. Responsive strategy intentional?          NO       NO     CONFIRMED
  4. Accessibility specified beyond aspirational? NO    NO     CONFIRMED
  5. AI-slop risk addressed (anti-default)?    NO       NO     CONFIRMED
  6. Visual tokens locked?                     NO       NO     CONFIRMED
  7. Education placement appropriate?          NO       NO     CONFIRMED (CRITICAL)
═════════════════════════════════════════════════════════════════════════
```

**7/7 dimensions agree.** Notable independent convergence (both voices, no shared context):
- Both flagged **Education in primary nav** as the single most distribution-sensitive design decision. Both recommend the *exact same fix*: Inventory-item-detail Reference tab + secondary entry under "More" (or settings sub-screen), never primary nav. Independent CRITICAL.
- Both flagged the **default-shadcn aesthetic risk**. Codex: "utility-lab, not SaaS." Claude subagent: "lab-notebook (serif display + mono numerics + paper-toned)." Same family of recommendation.
- Both demanded an explicit **screen × state matrix** before implementation.
- Both flagged **dose-logging tap count** is misrepresented in the plan (claimed "1 thumb tap"; actual cold-launch path is 4-7 taps).
- Both flagged **desktop strategy** as empty language.

### CODEX SAYS (design — UX challenge)

> [CRITICAL] IA is organized around feature silos, not the core job. Today/Inventory/Protocols/Insights/Settings is developer-nav. Today is stuffed with 5 competing priorities above the only time-critical action.
>
> [CRITICAL] Education is positioned like a product feature, not a supporting reference. Main-nav + seeded content makes the app look like a peptide reference catalog — exactly the distribution trap the CEO review warned about.
>
> [HIGH] Interaction-state coverage is patchy and biased toward happy-path math errors. Required states missing across every screen.
>
> [HIGH] "Mobile-first but desktop-friendly" is empty language. Lock breakpoints, lock what changes at ≥1024px and ≥1280px.
>
> [HIGH] Accessibility is QA-afterthought. Body diagram needs a parallel list mode. iOS decimal locale handling is unsolved by inputmode alone. Cloudflare Access first-run on the spouse's phone is ignored.
>
> [HIGH] Will ship looking like default shadcn SaaS. Lock anti-default identity: utility-lab, not SaaS. Dense but calm. Restrained motion. No growth-dashboard aesthetics.
>
> [MEDIUM] Visual system underspecified. No typography, no tokens, no motion language.
>
> [MEDIUM] Calendar subscription needs platform-specific flows, not a naked URL.

### CLAUDE SUBAGENT (design — independent review)

> Verdict: beautifully engineered domain spec wearing designer's clothes that don't fit. The plan defers ~30 design decisions to the implementer.
>
> 1. [CRITICAL] No primary-action shortcut for "log a dose" — center-docked persistent action missing.
> 2. [CRITICAL] Education module placement breaks the 5-tab thumb-reach convention and signals "drug reference app" to App Store reviewers. Drop from primary nav.
> 3. [HIGH] Disclaimer pattern unspecified — recommend bottom-anchored persistent footer + first-time blocking modal.
> 4. [HIGH] Missing interaction states (full per-screen audit produced).
> 5. [HIGH] Glove-friendly reconstitution UX is asserted but not designed.
> 6. [HIGH] First-time user emotional arc is undefined — Cloudflare OTP-first feels like corporate VPN, not a wellness tool.
> 7. [HIGH] Wife's first sign-in friction unaddressed.
> 8. [HIGH] Calendar subscription UX glossed.
> 9. [HIGH] AI-slop risk high — recommend lab-notebook anti-default.
> 10. [HIGH] Specificity vacuum — no type scale, no tokens, no motion.
> 11-16. [MEDIUM] Desktop, body-diagram a11y, decimal-keyboard, citation rendering, education editing UX, motion personality.

### Design Litmus Scorecard (post-review targets)

| Check | Pre-review | Target | Locked-in fix |
|---|---|---|---|
| 1. Brand unmistakable on first paint | 2/10 | 8/10 | Lab-notebook / utility-lab anti-default identity (TASTE — see gate). |
| 2. Strong visual anchor on every screen | 3/10 | 8/10 | Big-Result-Tile in calculator; Pending-Doses-as-hero on Today. |
| 3. Scannable by headlines | 4/10 | 9/10 | Display serif headings + numeric mono (or Codex's compact-label / large-numeric-readouts variant). |
| 4. Each section has one job | 3/10 | 9/10 | Today = task screen, not dashboard. Move warnings/burn-down/recent below the fold or to Insights. |
| 5. Cards necessary (not card-soup) | 2/10 | 8/10 | ≤3 card types on Today. No KPI tiles. No default shadcn Card stack for every section. |
| 6. Motion improves hierarchy | 3/10 | 8/10 | 150-200ms functional only. No decorative bounce. Dose-save animation is the receipt; toast is secondary. |
| 7. Premium without decorative shadows | 4/10 | 9/10 | Zero shadows. Separators only. High-contrast neutrals, one warning hue, one action hue. |

### Per-screen state matrix (must be filled by implementation)

The plan defers most of these. Locking the minimum-required matrix here.

| Screen | loading | empty | error | success | offline | sync-pending | sync-conflict | partial | expired-data | no-permission |
|---|---|---|---|---|---|---|---|---|---|---|
| Today | TODO | spec'd | TODO | spec'd (toast) | TODO | TODO | TODO | TODO | n/a | TODO |
| Inventory list | TODO | TODO | TODO | n/a | TODO | per-row dot | TODO | TODO | strikethrough vials | TODO |
| Inventory detail | TODO | n/a | TODO | TODO | TODO | TODO | TODO | TODO | spec'd (override-confirm) | TODO |
| Calculator | n/a | spec'd | spec'd (math) | spec'd (preset) | n/a | n/a | n/a | n/a | n/a | n/a |
| Protocol builder | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | n/a | TODO |
| Dose log flow | TODO | n/a | TODO | spec'd (undo) | **CRITICAL** | TODO | TODO | TODO | spec'd (expired-vial-confirm) | TODO |
| Calendar settings | TODO | n/a | TODO | TODO | TODO | TODO | n/a | n/a | revoked-token | TODO |
| Education | TODO | TODO | TODO | n/a | cached-copy | n/a | n/a | n/a | citation-broken | TODO |

### Design Decisions to Lock (from both voices)

These are decisions the plan currently defers to the implementer. Both voices recommend locking them now:

1. **Visual identity** — anti-default direction (Codex: utility-lab; Subagent: lab-notebook). Pick one. **TASTE DECISION** → final gate.
2. **Bottom-nav center-action** — center-docked "Log" (Subagent recommendation). Codex says reduce to 4 tabs + More. **TASTE DECISION** → final gate.
3. **Education placement** — both recommend Inventory-detail-only + secondary under More, not primary nav. **USER CHALLENGE** (overrides the user's stated "Education section in main nav") → final gate.
4. **Disclaimer pattern** — bottom-anchored footer + first-time blocking modal (Subagent). Codex agrees: persistent disclaimer block per page.
5. **Citation rendering** — superscript footnote markers + end-of-page list with DOI links. No abstract embedding.
6. **Education editor** — structured fields + markdown only (no rich text); citations as required structured pairs.
7. **Typography scale** — locked: 13/15/17/22/28 + mono-14 numerics, family TBD per identity choice.
8. **Spacing scale** — 4/8/12/16/24/32 (4px base).
9. **Border-radius scale** — 0/4/12 (opinionated subset).
10. **Shadow scale** — none. Separators only.
11. **Motion language** — 120ms ease-out for state changes; 240ms ease-in-out for sheet/modal; no spring physics.
12. **Density** — comfortable on mobile, compact on desktop.
13. **Calendar URL share UX** — provider-specific buttons (Apple / Google / Outlook / Copy URL + QR), each with platform-specific instructions inline. Default privacy = `generic`.
14. **Body diagram** — parallel list mode (chips grouped by region) alongside SVG. Both keyboard-navigable. Site labels for screen readers include last-used recency.
15. **Decimal-keyboard locale handling** — accept both `,` and `.`, normalize aggressively, unit-test the parser.
16. **Cloudflare Access onboarding** — bespoke "value before consent" pre-auth screen + post-auth "Add to Home Screen" inline instruction. Add `target="_blank"` and "Open in Safari" hint to the invite email to avoid in-app browser session siloing.
17. **Desktop layout** — at ≥1024px: bottom-nav becomes 240px left rail; Today becomes 2-column (Pending left, warnings/activity right); inventory detail becomes inline split-pane. At ≥1280px: rail collapses to icons; max content width 960/1280 (forms/dashboards); calculator gets persistent right-context rail for "show your work."

### Phase 2 — NOT in scope (deferred)

- Custom-illustrated empty states (use typography-led placeholders for v1).
- Onboarding video / animated walkthrough.
- Internationalization beyond decimal-locale parsing.
- Per-user theme customization.

### Phase 2 — Completion Summary

| Pass | Pre-review | Post-review target | Status |
|---|---|---|---|
| 1. Information Architecture | 3/10 | 9/10 | Restructure required (Today = task; Education out of nav). |
| 2. Interaction State Coverage | 3/10 | 9/10 | State matrix produced; implementer must fill. |
| 3. User Journey & Emotional Arc | 4/10 | 8/10 | First-run + reconstitution + spouse-onboard scenarios specified. |
| 4. AI-Slop Risk | 2/10 | 9/10 | Anti-default identity decision raised to gate. |
| 5. Design System Alignment | n/a | 9/10 | DESIGN.md does not exist; tokens locked above. |
| 6. Responsive & Accessibility | 3/10 | 8/10 | Breakpoints + body-diagram parallel list + a11y locked. |
| 7. Unresolved Design Decisions | many | 0 | 17 decisions surfaced; 3 raised to gate; 14 locked. |

**Phase 2 verdict:** UI scope review identified 1 USER CHALLENGE (Education placement) and 2 TASTE DECISIONS (visual identity, bottom-nav center action) for the final gate. The rest of the design decisions are locked above.

---

## Phase 3 — Eng Review

### Step 0 — Scope Challenge (greenfield-aware)

- **Code leverage:** zero existing codebase. Reuse opportunity is at the npm-package level. The plan picks Dexie + Drizzle + Hono + rrule + ics + zod + tanstack-query — all reasonable Layer-1 / Layer-2 choices. Two are at risk in the Workers runtime (see consensus item #5).
- **Minimum scope:** if the user had not overridden the CEO consensus, M3+M4+M9-Worker would be cut. They were kept by user decision.
- **Complexity check:** 11 milestones × ~5 files each ≈ 55 files. Above the 8-file/2-class smell threshold from the eng-review heuristic. Already raised at the CEO premise gate; user accepted.
- **Distribution:** PWA + Cloudflare Pages + Worker — Wrangler covers it; install method is documented.

### Eng Dual Voices — Consensus Table

```
═══════════════════════════════════════════════════════════════════════
  Dimension                                Claude   Codex   Consensus
  ──────────────────────────────────────── ──────── ─────── ──────────
  1. Architecture sound?                    NO       NO     CONFIRMED
  2. Test coverage sufficient?              NO       NO     CONFIRMED
  3. Performance risks addressed?           NO       NO     CONFIRMED
  4. Security threats covered?              NO       NO     CONFIRMED
  5. Error paths handled?                   NO       NO     CONFIRMED
  6. Deployment risk manageable?            NO       NO     CONFIRMED
═══════════════════════════════════════════════════════════════════════
```

**6/6 dimensions agree.** Independent convergence on 12 specific findings — both voices, no shared context, identical fixes proposed for the worst items. This is the highest-confidence consensus the autoplan pipeline produces.

### Cross-phase themes (Phase 1 + Phase 3)

Two themes appeared in both CEO and Eng phases independently:
- **Theme: "the plan papers over hard problems with elegant primitives."** CEO flagged this as "engineering thoroughness as substitute for product validation." Eng flagged it as "sync model treated as solved while being fundamentally under-specified." Same shape, different layer.
- **Theme: "deployment / operations is missing."** CEO didn't have visibility into this; Eng surfaced no staging, no rollback, no D1 migration story, atomic-deploy assumption is false.

### CODEX SAYS (eng — architecture challenge)

> 1. [CRITICAL conf 10] `updated_at`-driven LWW is trust-on-first-write and trivially exploitable. Server must issue revisions; mutation IDs for idempotency.
> 2. [HIGH conf 10] `version` column is dead weight as written. Make authoritative or remove.
> 3. [HIGH conf 9] "Dexie schema mirrors Drizzle 1:1" is false in any meaningful integrity sense.
> 4. [HIGH conf 9] `withTenant()` + ESLint is partial developer hygiene, not a tenant boundary. Ban raw D1 access.
> 5. [MEDIUM conf 8] `rrule` and especially `ics` Workers compatibility unverified.
> 6. [HIGH conf 9] Outbox underspecified — no `mutationId`, ack marker, retry state, compaction.
> 7. [HIGH conf 8] `/sync/push` idempotency missing.
> 8. [MEDIUM conf 9] Timezone storage as ISO offset is wrong for recurring schedules; use IANA TZ.
> 9. [HIGH conf 10] Security gaps: no markdown sanitizer; HMAC token format/timing-safe-compare/claim-binding undefined; JWT verification described at brochure level.
> 10. [MEDIUM conf 9] D1 indexes never specified; sync plan non-credible without them.
> 11. [MEDIUM conf 8] `remainingQuantity` cached + ledger = two sources of truth.
> 12. [HIGH conf 10] Deployment + migration not production-safe (no staging, atomic-deploy assumption false, no rollback).
>
> Single biggest hidden risk: sync model is fundamentally under-specified while treated as solved. Will appear to work in happy-path demos and silently corrupt household state under normal offline/retry behavior.

### CLAUDE SUBAGENT (eng — independent review)

> Verdict: 30% more infra than v1 demands; "this works because we said so" load-bearing claims will not survive contact with reality. Specific findings:
>
> A1 [HIGH 8] rrule + ics Workers compatibility unproven. A2 [CRITICAL 9] LWW updated_at is forgeable. A3 [MEDIUM 9] Cloudflare lock-in concentration. A4 [MEDIUM 7] `withTenant` is real if implemented as phantom-typed `ScopedDb<T>`, theater if regex-on-string. A5 [HIGH 8] Undo + cross-device LWW conflict silently squashes partner edits.
>
> E1-E7 edge cases: outbox unbounded; timezone mid-protocol; long-running schedule indexes; mid-reconstitution disconnect; idempotency missing.
>
> T1-T8 test gaps: branch coverage > line coverage; missing NaN/Infinity edge tests; ICS UID stability snapshots; Worker negative tests per route; ESLint rule's own fixtures.
>
> S1 [CRITICAL 10] Markdown XSS — no sanitizer committed. S2-S6 HMAC token format, JWT verification, `household_id` strip contract, JSON import strictness, SW cache poisoning.
>
> H1-H5 hidden complexity: `version` does nothing; "Dexie 1:1 Drizzle" is false; Dexie multi-store transaction abort gotchas; sync no-op + dead schema columns; D1 region pinning latency.
>
> D1-D4 deployment: wrangler deploy not atomic; no D1 blue/green; no staging; no rollback procedure.
>
> P1-P4 perf: N+1 inventory list forecast; Recharts bundle on mobile; dexie-react-hooks re-render storms; Worker D1 cold-start.

### Section 1 — Architecture (ASCII dependency graph)

```
┌─────────────────────── PWA Client ────────────────────────────┐
│                                                                │
│  Pages (TodayPage, InventoryPage, CalculatorPage, ...)         │
│      │                                                         │
│      ▼                                                         │
│  Features (vertical slices)                                    │
│      │                                                         │
│      ▼                                                         │
│  Stores (Zustand UI state) + TanStack Query (derived)         │
│      │                                                         │
│      ▼                                                         │
│  Repositories (HouseholdRepo, DoseLogRepo, ... )              │
│      │                       │                                 │
│      ▼                       ▼                                 │
│  Dexie (IDB)            Outbox (IDB table)                    │
│      ▲                       │                                 │
│      │                       ▼                                 │
│      │              Sync client (drainer + puller)            │
│      │                       │                                 │
│      └───────────────── domain/ (pure TS) ────────┐            │
│                                                    │            │
└──────────────────────────────────────────────────┬─┴────────────┘
                                                   │ HTTPS + Access JWT
                                                   ▼
┌──────────────────────── Cloudflare ──────────────────────────┐
│                                                               │
│  Access (Zero Trust gateway — JWT issuance, JWKS endpoint)   │
│      │                                                        │
│      ▼                                                        │
│  Worker (Hono)                                                │
│   ├─ /sync/pull, /sync/push  ←─── tenant.ts (`withTenant`)   │
│   ├─ /feed/user/:id.ics      ←─── HMAC token validation       │
│   ├─ /feed/household/:id.ics                                  │
│   └─ shared domain/ pure TS (rrule, ics, math, scheduling)   │
│      │                                                        │
│      ▼                                                        │
│  D1 (SQLite at edge — household_id partitioned)              │
│      │                                                        │
│      ▼                                                        │
│  R2 (daily wrangler-snapshot backup)  ◄── added by review    │
└───────────────────────────────────────────────────────────────┘
```

**Coupling concerns:**
- Domain layer ←→ both runtimes. Workers compatibility for `rrule` and `ics` is the single point of failure for "shared TS files" claim. **Pre-M1 spike required.**
- Dexie `version` field ←→ unused. Dead weight. **Drop or wire OCC.**
- `remainingQuantity` cached column ←→ ledger sum. Two sources of truth. **Derive from ledger; treat cache as projection.**

### Section 2 — Code Quality (forward-looking)

Greenfield — most findings concern the spec itself, not existing code:

| Concern | Current spec | Fix |
|---|---|---|
| DRY: Zod schema in `domain/`, Dexie schema in `web/db/`, Drizzle schema in `worker/db/` | Three places to keep in sync | Codegen Dexie + Drizzle field lists from `domain/schemas` Zod via `drizzle-zod` and a Dexie codegen script. Add a CI parity assertion. |
| Naming: `version` column | Implies CRDT/OCC, has neither | Either wire OCC or remove. |
| Error handling: `notesMd` rendering | No sanitizer | Mandate `markdown-it` with HTML disabled OR `marked` + `DOMPurify` allowlist. Brand the output as `SanitizedHtml`. |
| Over-engineering: `version` + `outbox` for users 1-4 | Already user-overridden | Accepted by user per premise gate; not contested here. |

### Section 3 — Test Review (test diagram)

```
DOMAIN (pure TS — runs in browser AND Worker)             COVERAGE TARGET
─────────────────────────────────────────────────         ───────────────
[+] math/reconstitution.ts                                 ★★★ branches
  ├── reconstitute(vialMass, diluentMl)
  │   ├── happy path (3 examples from §7.7)               [TESTED]
  │   ├── 0 mL diluent → MathError                        [TESTED]
  │   └── negative inputs → Zod boundary                   [TESTED]
[+] math/dose.ts                                           ★★★ branches
  ├── doseToVolume(dose, concentration)
  │   ├── happy path                                       [TESTED]
  │   ├── division-by-zero                                 [TESTED]
  │   ├── unit mismatch warning                            [GAP]
  │   └── insulin units (U-100, U-40, U-500)               [GAP]
[+] math/units.ts                                          ★★★ property
  ├── round-trip identity (mcg↔mg↔g)                       [TESTED via fast-check]
  ├── locale parsing (`"1,5"`)                             [GAP — Codex S]
  └── NaN/Infinity/MIN_VALUE                                [GAP]
[+] scheduling/expand.ts                                   ★★★ branches
  ├── DST forward / DST back                                [GAP]
  ├── Feb 29 / BYMONTHDAY=31                                [GAP]
  ├── COUNT=0 / UNTIL past                                  [GAP]
  ├── EXDATE past UNTIL                                     [GAP]
  ├── Cycle on/off boundary                                 [GAP]
  └── TZ change mid-protocol (NEW per Codex S8)             [GAP]
[+] ical/generate.ts                                       ★★★ snapshot
  ├── RFC-5545 validates                                    [GAP]
  ├── line-folded at 75 octets                              [GAP]
  ├── CRLF endings                                          [GAP]
  ├── UID stability (DTSTAMP excluded from UID input)       [GAP — both voices]
  ├── empty feed (0 occurrences)                            [GAP]
  └── privacy mode SUMMARY/DESCRIPTION                      [GAP]

PERSISTENCE (web/db/)
─────────────────────
[+] Repositories (fake-indexeddb)
  ├── DoseLogRepo.create() atomicity                        [GAP — H3 transaction-abort gotcha]
  ├── Undo reversal                                          [GAP]
  ├── soft-delete filter on every query                     [GAP]
  ├── outbox compaction (per-row supersede)                 [GAP]
  └── schema-parity CI check                                 [GAP]

WORKER (miniflare)
──────────────────
[+] Tenant isolation per route                             [GAPS — 7 negative cases]
  ├── forge household_id in body                            [GAP]
  ├── forge userId from another household                   [GAP]
  ├── forge batchId from another household (FK ownership)   [GAP]
  ├── forge JWT signature                                    [GAP]
  ├── expired JWT                                            [GAP]
  ├── valid JWT for A, payload for B                         [GAP]
  └── SQL injection in `since=`                              [GAP]
[+] Idempotency
  └── same mutationId retried → applied once                [GAP]
[+] Server-stamped updated_at                              [GAP]
[+] OCC on version (compare-and-swap)                      [GAP]
[+] HMAC token timing-safe + claim binding                 [GAP]
[+] JWT verification (JWKS / iss / aud / exp / kid miss)   [GAP]

ESLINT custom rule (no-unscoped-d1)
────────────────────────────────────
[+] positive + negative fixtures                           [GAP]

E2E (Playwright)
────────────────
  See ~/.gstack/projects/peptide-tracker/alex-main-test-plan-20260429.md

COVERAGE: 6/55+ surfaces explicitly tested in plan. Most gaps from review.
QUALITY (★★★ branch+edge / ★★ happy / ★ smoke):
  Domain math: ★★★ planned, several edge gaps
  Worker: nearly 0 specified; review surfaced ~15 negative tests
  Sync: 2 specified; review added 4 more (force-pull, idempotency, OCC, outbox compaction)
GAPS: 30+ test cases added by review (see test plan artifact)
```

**Test plan artifact written to:** `~/.gstack/projects/peptide-tracker/alex-main-test-plan-20260429.md`

### Section 4 — Performance

| Concern | Severity | Specific fix |
|---|---|---|
| N+1 in inventory list (forecast remaining doses per row) | MEDIUM | Precompute `forecastedDepletionAt` on schedule mutation; store on `InventoryBatch`. |
| Recharts bundle (~120 KB gzip) on mobile | MEDIUM | `React.lazy` the Insights page; defer Recharts to second paint. |
| `dexie-react-hooks` re-render storms | MEDIUM | Narrow `useLiveQuery` to specific records; paginate; `React.memo` budget. |
| Worker D1 cold start | LOW | ~50-150ms first query; not user-visible. |
| Long-running schedule expansion | LOW | 730 rows for 2-year RRULE is cheap; needs `(household_id, user_id, scheduled_for)` index. |

### Failure Modes Registry (with critical-gap flags)

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES | LOGGED? | CRITICAL GAP? |
|---|---|---|---|---|---|---|
| `/sync/push` LWW | Forged future `updated_at` | **NO** | NO | n/a (silent data loss for partner) | NO | **YES — CRITICAL** |
| `notesMd` rendering | XSS via `[click](javascript:...)` | **NO** | NO | RCE in auth context | NO | **YES — CRITICAL** |
| Markdown rendering pipeline | HTML allowed by default | NO | NO | XSS surface | NO | **YES — CRITICAL** |
| `/sync/push` retry after partial success | Duplicate `InventoryAdjustment` | **NO** (no idempotency) | NO | Inventory drifts silently | NO | **YES — CRITICAL** |
| Outbox after 21 days offline | Unbounded growth | NO | NO | Sync stalls / slow drain | NO | **YES — HIGH** |
| RRULE expansion in Tokyo for NY-created schedule | Wrong wall-clock fire time | NO | NO | Missed dose | NO | **YES — HIGH** |
| Atomic Dexie multi-store transaction | Partial write on validation throw post-IDB | NO (rely on Dexie default) | NO | Inventory desync | NO | **YES — HIGH** |
| HMAC token compare | Timing attack | Spec'd | NO | n/a | NO | HIGH |
| Cloudflare Access JWT verification | JWKS not cached / `kid` miss | NO | NO | Worker 5xx storm on rotation | NO | **YES — HIGH** |
| `wrangler deploy` Worker + Pages atomicity | Old client → new Worker, or vice versa | NO | n/a | Confusing breakage during deploy | NO | **YES — HIGH** |
| D1 schema migration without blue/green | Old client reads dropped column | NO | NO | App crashes for users mid-rollout | NO | **YES — HIGH** |

**Critical gaps total: 8.** All have specific fixes in the consensus findings above.

### Phase 3 — Section 5 — NOT in scope

- Switching from D1 to Postgres (deferred to v2 commercialization).
- CRDT layer (revisit if LWW + OCC isn't enough).
- Sharding by household across multiple D1 databases (v2 scale concern).
- Native push notifications via Web Push (best-effort PWA only in v1).

### Section 6 — Deployment Contract (added by review)

The plan ends with raw `wrangler deploy`. Production-safe contract added by review:

1. **Staging environment:** add `[env.staging]` to `wrangler.toml` with separate D1 binding (`peptide-tracker-staging`); preview Pages branch deploys to `*.preview.example.com`.
2. **Deploy order:** **always Worker before Pages.** New Worker route is *additive* and backward-compatible (old client keeps working). Then deploy Pages — new client uses new Worker. Schedule old-Worker-route removal in a follow-up deploy after old clients have rotated (~14 days).
3. **D1 migration policy: expand-then-contract.**
   - Step 1: deploy a migration that *adds* columns/tables; Worker code reads-and-writes both old and new shapes.
   - Step 2: deploy code that reads new only; old shape becomes write-only-for-back-compat.
   - Step 3 (after 14 days): deploy migration that drops old shape.
   - Tooling: `wrangler d1 migrations apply --env staging` runs in CI before promotion to production.
4. **Rollback procedure:**
   - Worker: `wrangler rollback` (reverts deployment but not D1 schema).
   - Schema: restore from latest R2 snapshot via `wrangler d1 execute --file=snapshot.sql`.
   - Document expected RTO: ≤ 15 minutes.
5. **Daily backup:** Worker cron at 03:00 UTC runs `wrangler d1 export` → R2 bucket; retain 30 days. Documented in `wrangler.toml`.

### Phase 3 — What already exists

Greenfield. The "exists" axis is npm-package leverage. Plan picks reasonable Layer-1/Layer-2 packages; two (`rrule`, `ics`) need pre-M1 Workers compatibility verification.

### Phase 3 — TODOS.md additions

To be written as `TODOS.md` in repo root (proposed):
- TODO M0+: Pre-M1 spike — verify `rrule` + `ics` in `wrangler dev` against an actual D1 binding. Replace with hand-rolled if either fails.
- TODO M3: Server-stamped `updated_at`. OCC on `version`. Idempotency on `/sync/push` via mutation IDs. Cross-row FK ownership validation.
- TODO M3: Define D1 indexes explicitly in `0001_init.sql`: `(household_id, updated_at)`, `(household_id, deleted_at)`, `(household_id, user_id, scheduled_for, status)`, `(household_id, scope, user_id)` for feeds, `(household_id, batch_id, created_at)` for ledger.
- TODO M3: Schema parity CI assertion (codegen Dexie + Drizzle field lists from `domain/schemas`).
- TODO M3: Cloudflare Access JWT verification with JWKS caching, `iss/aud/exp/kid-miss` handling.
- TODO M3: HMAC ICS token claim binding (sign `{householdId, userId, scope, exp, jti}`), timing-safe compare.
- TODO M3 + M9: ban raw D1 access; expose only `withTenant(c)`-derived `ScopedDb`.
- TODO M2: Outbox model upgrade — `mutationId`, `entityType`, `entityId`, `retryCount`, `lastError`, `ackAt`. Compaction pass.
- TODO M2: Atomic Dexie multi-store transaction safety — validate before transaction; explicit `tx.abort()`.
- TODO M2 + M3: Markdown XSS — choose `markdown-it` (HTML off) OR `marked` + `DOMPurify`. Brand output as `SanitizedHtml`. Render only via `renderTrustedNotes()`.
- TODO M0: Add `wrangler.toml [env.staging]` block.
- TODO M0: Add daily D1 → R2 backup cron.
- TODO M2 + M3: Reconcile `remainingQuantity` cache vs ledger — derive from ledger, cache only as projection.
- TODO M7: Add IANA `timezone` to `ProtocolItem`. Expand from `(RRULE, tz, local time)` not from offset timestamps.
- TODO M11: SRI on service worker registration; `updateViaCache: 'none'`.
- TODO All: branch coverage ≥ 90% (not line coverage); add `NaN/Infinity/locale-comma` math edge tests.

### Phase 3 — Completion Summary

| Dimension | Result |
|---|---|
| Mode | FULL_REVIEW |
| Scope challenge | Code-leverage map produced; complexity flagged (already user-accepted) |
| Architecture diagram | Produced (ASCII above) |
| Test diagram | Produced (above); 30+ gaps identified |
| Test plan artifact | Written to `~/.gstack/projects/peptide-tracker/alex-main-test-plan-20260429.md` |
| Failure modes | 11 rows; 8 CRITICAL gaps |
| TODOs added | 16 items |
| Outside voices | Codex eng ✓ + Claude subagent eng ✓ |
| Consensus | 6/6 dimensions confirmed |
| Critical gaps | 8 (LWW forgery, XSS, /sync idempotency, outbox unbounded, TZ in RRULE, transaction abort, JWKS rotation, deploy non-atomic) |

---

## Phase 3.5 — DX Review

### Step 0 — DX Scope Assessment

- **Product type:** consumer PWA + Cloudflare backend, with three distinct developer-journey audiences:
  - **Journey A:** the AI builder (Claude Code) implementing §12 milestone prompts.
  - **Journey B:** a returning maintainer (the user, 6 months later, or a future contributor).
  - **Journey C:** a brand-new consumer signing up — re-classified as in-scope by the user's premise-gate clarification.
- **Personas (inferred):**
  - **Alex (the user):** experienced developer, fluent in Azure, picking up Cloudflare. Builds via Claude Code. Tolerates moderate setup.
  - **Future-Alex / contributor:** has not seen the codebase in months. Wants to add a feature without re-reading the whole plan.
  - **Consumer (Wife / signup user):** non-developer. Phone-first. Zero patience for setup friction.
- **Initial DX completeness rating: 4/10.** Architecture is strong. Operational scaffolding is missing.

### DX Dual Voices — Consensus Table

```
═══════════════════════════════════════════════════════════════════════════
  Dimension                                Claude   Codex   Consensus
  ──────────────────────────────────────── ──────── ─────── ──────────
  1. Getting started < 5 min?               NO       NO     CONFIRMED
  2. API/CLI naming guessable?              PARTIAL  NO     CONFIRMED-DEGRADED
  3. Error messages actionable?             NO       NO     CONFIRMED
  4. Docs findable & complete?              NO       NO     CONFIRMED
  5. Upgrade path safe?                     NO       NO     CONFIRMED
  6. Dev environment friction-free?         NO       NO     CONFIRMED
═══════════════════════════════════════════════════════════════════════════
```

**6/6 dimensions agree.** Both voices flagged the same CRITICAL items independently. One major **USER CHALLENGE** propagates from the user's premise-gate clarification:

- **CRITICAL: Cloudflare Access (gated allowlist) and consumer-personal-use signup are mutually exclusive product states.** Both voices flag this independently. Hard contradiction between the user's §1/§4 architecture (Access for the household) and §11 commercialization clarification (consumer signup). Cannot ship both as currently specified.
- **CRITICAL: §12 milestone prompts miss operational prereqs** (wrangler login, d1 create, Access app create, secret put, .dev.vars).
- **CRITICAL: README undefined** — neither voice can construct a maintainer's mental model from the plan.
- **CRITICAL: Local dev broken under Cloudflare Access** — no dev-mode JWT bypass; Worker 401s every local request.
- **HIGH (Codex unique): §12 prompts still encode pre-review-corrected assumptions.** LWW updated_at, toy outbox shape, untested rrule/ics — all corrected by the eng review but not propagated back to the prompts.
- **HIGH: Schema drift across Zod + Dexie + Drizzle** without codegen or CI parity check.
- **HIGH: Observability absent** — no structured logs, no client error reporting, no sync-health UI.
- **HIGH: Education distribution controls missing** — no feature flag for hostile-reviewer builds.
- **HIGH: Upgrade UX missing** — Stripe + tier caps mentioned, no actual paywall surface.

### CODEX SAYS (DX — developer experience challenge)

DX Scorecard: 2/4/2/3/4/3/2/1 = avg 2.6/10. Top 3 recs:
1. Add a pre-M0 "bootstrap and local-dev contract" section. Make Cloudflare/D1/Access/secrets/staging concrete and reproducible.
2. Rewrite M1-M4/M9 to absorb the engineering review's corrections instead of leaving invalid prompts in place.
3. Resolve the auth/product contradiction now: closed household app with Access, OR consumer signup product. Not both.

Single biggest DX risk: the fake local-dev story around Cloudflare Access. Without it, every journey degrades — Claude cannot implement reliably, maintainers cannot debug regressions, consumer-signup work cannot even be prototyped credibly.

### CLAUDE SUBAGENT (DX — independent review)

DX Scorecard: 5/6/3/4/4/6/3/2 = avg 4.1/10. Top 3 recs:
1. Write an "M0.5 — operator setup" prompt + a real README skeleton with 8 named sections.
2. Resolve the consumer-auth contradiction now, not at v2 — ship Clerk alongside Access in v1, OR rewrite §1/§11 to say "v1 is household-beta only."
3. Add observability + sync-health UI as a first-class feature, not an afterthought.

Single biggest DX risk: the plan optimizes for *writing* code and ignores *running, debugging, onboarding, and evolving* it.

### Developer Journey Map (6-stage trace)

| Stage | Developer does | Friction points | Status |
|---|---|---|---|
| 1. Discover | Read PLAN.md, decide to build | None — plan is well-written | ✓ Strong |
| 2. Install | `pnpm install`; configure wrangler | wrangler login (interactive); D1 create; Access app create; HMAC secret; pnpm dev concurrent runner not specified; Tailwind v4 churn | ✗ ~35 min un-spec'd friction |
| 3. Hello World (M0) | Boot the app shell + Worker | `wrangler dev` 401s without Access JWT in dev; no dev bypass; local D1 needs migrations | ✗ Boot fails; Claude derives wrong fix |
| 4. Real Usage (M1-M9) | Implement milestones one at a time | Each new session must read prior milestones' code (not stated); Codex eng-review corrections never made it back into the prompts; tests vague enough to skip | ✗ Plan ships with stale prompts |
| 5. Debug | "Sync isn't working — why?" | No structured logs, no sync-health UI, no client error reporter, no debug breadcrumbs | ✗ Undiagnosable failure modes |
| 6. Upgrade | Add a column / migrate D1 | Three schemas to update (Zod + Dexie + Drizzle); no codegen; no parity CI; no documented `pnpm migrate` script | ✗ Drift inevitable |

### TTHW — Time To Hello World

| Journey | Pre-review estimate | Post-review estimate | Tier |
|---|---|---|---|
| A — AI builder, M0 boot | "fast — Claude does it" | ~60 min (35 min friction) | Needs Work |
| A — full M0→M8 chain to first dose logged | "11 weekends" | ~12-18 hours of CC session time across 9 prompts × 1-2 follow-ups each | Competitive (with fixes) |
| B — Returning maintainer, working local dev | unspecified | 1.5-3 hours | Red Flag |
| C — Brand-new consumer | unspecified | **BLOCKED** (Access allowlist incompatible with self-service signup) | Impossible |

**Target after fixes:** A=15 min, B=20 min, C=conditional on auth resolution.

### Developer empathy narrative (first-person, future-Alex 6 months later)

> I open the repo, run `pnpm install`. Then `pnpm dev`. The web hits the Worker, which 401s. I check the README — it tells me about the no-medical-claims rule. Cool. It does not tell me how to log into Cloudflare locally. I `grep` for "401" — no debug helper. I check `wrangler.toml` — yep, Access is on. I cannot find a `WRANGLER_DEV_FAKE_USER` env var because it does not exist. I open Cloudflare Dashboard, the Access app does not have my dev URL whitelisted. I add it. Now `wrangler dev` returns OK but the JWT signature fails because dev is using a different team. I'm 45 minutes in. I have not read a single dose log.

### DX Scorecard (consensus, after rounding both voices)

| # | Dimension | Score | Justification |
|---|---|---:|---|
| 1 | Getting started (TTHW) | **3/10** | Both voices flag CRITICAL friction in operational prereqs and Access dev bypass. Journey C is blocked. |
| 2 | API/CLI design (Worker routes, wrangler, §12 DSL) | **5/10** | Worker route shape is clean; §12 prompt DSL is durable but stale (still encodes pre-eng-review assumptions per Codex). |
| 3 | Error messages & debugging | **2/10** | No structured logs, no sync-health UI, no client error reporter. Worker 401 from dev is the worst error path in the plan. |
| 4 | Documentation & learning | **3/10** | README undefined. Eight named sections required. ESLint custom rule undocumented. |
| 5 | Upgrade & migration path | **4/10** | Phase 3 added expand-then-contract for D1; not propagated to milestones. Day-to-day "add a column" workflow unspecified. |
| 6 | Developer environment & tooling | **4/10** | Stack choice sound; TS strictness, Tailwind v4 PostCSS, concurrently/turbo not specified. |
| 7 | Community & ecosystem | **3/10** | No CONTRIBUTING.md, no LICENSE, no education-content contribution guide. |
| 8 | DX measurement & feedback loops | **2/10** | No telemetry, no feature flags, no sync-health dashboard, no error reporter. |
| **Avg** | | **3.3/10** | Architecture-strong, ops-weak. |

### DX Implementation Checklist (apply before / during M0-M1)

- [ ] Pre-M0 "operator bootstrap" prompt: copy-paste commands for `wrangler login`, `wrangler d1 create`, `wrangler secret put`, Access app provisioning. Values copied into `wrangler.toml` placeholders.
- [ ] `SETUP.md` documenting all interactive prereqs.
- [ ] Dev-mode auth bypass: `AUTH_MODE=dev` env var; Worker injects synthetic principal in `wrangler dev`; logs `"DEV AUTH BYPASS ACTIVE — do not deploy"`.
- [ ] `pnpm dev:as=alex@household` canonical local-dev command.
- [ ] README skeleton (Quickstart / Architecture / Local dev / Testing / Deploying / Migrations / Education content / Troubleshooting) produced by M0.
- [ ] Concurrently or Turbo for `pnpm dev` (web + wrangler dev together).
- [ ] Strict TypeScript settings (`"strict": true`, `"noUncheckedIndexedAccess": true`) in `tsconfig.base.json`.
- [ ] Zod-as-source-of-truth + Dexie/Drizzle codegen + `pnpm check:schemas` parity CI.
- [ ] Maintainer recipe `docs/schema-changes.md`: edit Zod → run codegen → review diff → write migration → apply local → apply staging → apply prod.
- [ ] Structured Worker logging contract: `{requestId, householdId, route, latencyMs, status}`.
- [ ] Client error boundary that POSTs to `/diag/log` with breadcrumbs.
- [ ] Settings → Sync Health page: last pull / push / outbox depth / failures.
- [ ] Feature-flag matrix by distribution channel: web / private beta / app-store build / billing-enabled.
- [ ] `FEATURE_EDUCATION` build flag — hostile-reviewer build strips Education entirely.
- [ ] Upgrade prompt surface specified: when free-tier limit hit (add product, invite user, enable hosted feed).
- [ ] CONTRIBUTING.md with `pnpm check`, `pnpm test`, `pnpm test:e2e`, `pnpm migrate`.
- [ ] LICENSE decision (recommend MIT for personal use; reconsider on commercialization).
- [ ] **Re-issue M1, M2, M3, M4, M9 prompts** to incorporate eng-review corrections (server-stamped updated_at, OCC, mutationIds, outbox compaction, IANA TZ, JWT verification spec, HMAC claim binding, schema parity, indexes).

### Phase 3.5 — NOT in scope

- DX measurement at scale (N>1000 users; consumer support workflows).
- Public open-source contributor on-ramp (defer to actual commercialization).
- Translated documentation (English-only).
- Video onboarding / animated walkthroughs.

### Phase 3.5 — Completion Summary

| Dimension | Result |
|---|---|
| Mode | DX_POLISH |
| Initial score | 4.1/10 (avg of voices, lowest 2.6 for sync observability) |
| Post-review target | 8/10 (with checklist applied) |
| Product type | Consumer PWA + Cloudflare Worker backend; AI-builder DSL |
| TTHW current | A=60min / B=1.5-3h / C=blocked |
| TTHW target | A=15min / B=20min / C=conditional on auth resolution |
| Outside voices | Codex DX ✓ + Claude subagent DX ✓ |
| Consensus | 6/6 dimensions confirmed |
| Critical findings | 4 (auth contradiction, prereqs, README, dev bypass); 1 USER CHALLENGE for gate |

---

## Decision Audit Trail

| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Premise challenge: P1 (sync need), P2 (SaaS-ready free), P3 (peptide commercialization viable) — all rejected by both voices | Mechanical | P1 completeness | 6/6 consensus across two independent voices |
| 2 | CEO | Mode change SELECTIVE_EXPANSION → SCOPE_REDUCTION recommended | User Challenge | n/a | User overrode the consensus and kept SELECTIVE_EXPANSION; recorded |
| 3 | CEO | Add Education / Information module (NEW user requirement) | User decision | n/a | User clarified at premise gate; structure spec'd in §3.10 delta |
| 4 | CEO | Strike §11 commercialization or rewrite as consumer-only | User decision | n/a | User chose consumer-personal-use signup, no clinical, no FDA |
| 5 | Design | Education in primary nav | User Challenge | n/a | Both voices flag CRITICAL — App Store risk. Recommend detail-tab only |
| 6 | Design | Visual identity (lab-notebook / utility-lab vs default shadcn) | Taste | P5 explicit-over-clever | Both voices recommend anti-default; pick one |
| 7 | Design | Bottom-nav center-action vs 4-tab+More | Taste | P5 explicit | Both voices want intentional structure; choose one shape |
| 8 | Design | Disclaimer pattern (footer + first-time modal) | Mechanical | P1 completeness | Both voices converged on same pattern |
| 9 | Design | Citation rendering (footnote markers + end list with DOI) | Mechanical | P5 explicit | Single defensible answer |
| 10 | Design | Education editor (structured + markdown only, no rich text) | Mechanical | P5 explicit | Single defensible answer |
| 11 | Design | Typography scale (13/15/17/22/28 + mono-14 numerics) | Mechanical | P1 completeness | Locked in §8.0 of plan |
| 12 | Design | Spacing scale (4/8/12/16/24/32) | Mechanical | P1 | Locked |
| 13 | Design | Border-radius scale (0/4/12) | Mechanical | P1 | Locked |
| 14 | Design | Shadow scale (none) | Mechanical | P5 | Locked |
| 15 | Design | Motion language (120ms / 240ms, no spring) | Mechanical | P1 | Locked |
| 16 | Design | Density (comfortable mobile, compact desktop) | Mechanical | P1 | Locked |
| 17 | Design | Calendar URL share UX (provider-specific buttons + QR + Copy) | Mechanical | P1 | Locked. Default privacy = `generic` |
| 18 | Design | Body diagram (parallel list mode + SVG; both keyboard-navigable) | Mechanical | P1 a11y | Locked |
| 19 | Design | Decimal locale parser (accept `,` and `.`) | Mechanical | P1 | Locked + tested |
| 20 | Design | Cloudflare Access onboarding (value-before-consent + Open in Safari hint) | Mechanical | P1 | Locked |
| 21 | Design | Desktop layout (≥1024 left rail, ≥1280 collapsed rail, 960/1280 max widths) | Mechanical | P1 | Locked |
| 22 | Eng | Server-stamped `updated_at` + OCC on `version` (replace LWW) | User Challenge | n/a | Both voices CRITICAL/CONF=10. Forgery exploit. Defaults to applied. |
| 23 | Eng | Idempotency on `/sync/push` via mutationIds | Mechanical | P1 | Both voices HIGH/CONF=8-9. No countervailing argument. |
| 24 | Eng | Outbox upgrade (mutationId, retryCount, ackAt, compaction) | Mechanical | P1 | Both voices HIGH. Single answer. |
| 25 | Eng | IANA timezone per ProtocolItem; expand from `(RRULE, tz, local)` | Mechanical | P1 | Both voices flagged. |
| 26 | Eng | DOMPurify / markdown-it sanitizer for `notesMd` (branded `SanitizedHtml`) | Mechanical | P1 security | Both voices CRITICAL. |
| 27 | Eng | HMAC token (timing-safe + claim binding `{householdId, userId, scope, exp, jti}`) | Mechanical | P1 | Both voices HIGH. |
| 28 | Eng | JWT verification spec (JWKS / iss / aud / exp / kid-miss) | Mechanical | P1 | Both voices HIGH. |
| 29 | Eng | D1 indexes specified explicitly | Mechanical | P1 | Both voices MEDIUM/HIGH. |
| 30 | Eng | Schema parity CI (Zod source of truth; Dexie + Drizzle codegen) | Mechanical | P4 DRY | Both voices HIGH. |
| 31 | Eng | Phantom-typed `ScopedDb<T>` (ban raw D1) | Mechanical | P5 explicit | Both voices HIGH. |
| 32 | Eng | Pre-M1 spike: verify `rrule` and `ics` in Workers runtime | Mechanical | P6 bias-to-action | Both voices flagged compatibility risk. |
| 33 | Eng | `[env.staging]` + R2 daily backup + expand-contract migrations + rollback | Mechanical | P1 | Both voices CRITICAL/HIGH. |
| 34 | Eng | Deploy order: Worker first (additive), Pages second | Mechanical | P5 | Both voices flagged atomicity issue. |
| 35 | Eng | `remainingQuantity` derived from ledger; cache as projection only | Mechanical | P5 | Codex MEDIUM, subagent implicit. |
| 36 | DX | Pre-M0 operator bootstrap prompt + `SETUP.md` | Mechanical | P1 | Both voices CRITICAL. |
| 37 | DX | Dev-mode JWT bypass (`AUTH_MODE=dev` synthetic principal) | Mechanical | P1 | Both voices CRITICAL. |
| 38 | DX | README skeleton with 8 named sections | Mechanical | P1 | Both voices CRITICAL. |
| 39 | DX | Re-issue M1, M2, M3, M4, M9 prompts to absorb eng-review corrections | Mechanical | P1 | Codex unique HIGH; subagent implicit via F4. |
| 40 | DX | Cloudflare Access vs consumer signup contradiction | User Challenge | n/a | Both voices CRITICAL. Mutually exclusive product states. |
| 41 | DX | Observability (structured Worker logs + client error boundary + Sync Health UI) | Mechanical | P1 | Both voices HIGH. |
| 42 | DX | `FEATURE_EDUCATION` build flag (hostile-reviewer build) | Mechanical | P1 | Both voices HIGH; reduces App Store / Stripe risk. |
| 43 | DX | Free-tier upgrade prompt surfaces (add-product limit, invite-user limit, hosted-feed gate) | Mechanical | P1 | Both voices flagged; single answer. |
| 44 | DX | LICENSE = MIT (recommend, reconsider at commercialization) | Auto | P6 | No countervailing argument. |
| 45 | DX | CONTRIBUTING.md scaffolded by M0 | Mechanical | P1 | Both voices flagged. |

**Total decisions: 45.** **2 User Challenges, 2 Taste Decisions, 41 auto-decided.**

---

## Phase 4 — Final Approval Gate (resolved 2026-04-29)

User reviewed the dual-voice consensus, the user challenges, and the taste decisions. Outcomes:

### User Challenges — resolved

**UC1 — Education placement: ACCEPTED.** Education becomes a `Reference` tab on `InventoryItem` detail, plus a secondary entry under a future "More" menu. NOT in primary bottom-nav.

**UC2 — Auth resolution: ACCEPTED option (a).** **v1 ships household-beta only with Cloudflare Access.** Consumer-personal-use signup becomes **v1.5** with Clerk or Auth.js. Apply these edits to the plan body during implementation:
- Rewrite §1 to say "v1: closed household beta. Consumer signup is v1.5."
- Rewrite §2 v1 — In Scope to remove "future SaaS commercialization framing" from v1; move it to v1.5.
- Rewrite §11 to be a v1.5+ roadmap (Clerk/Auth.js, Stripe, free-tier limits, upgrade UX) — explicitly *not* a v1 deliverable.
- Update §15 decisions table accordingly.

### Taste Decisions — resolved

**TD1 — Visual identity: LAB-NOTEBOOK.** Serif display + monospace numerics + paper-toned backgrounds, no card shadows. Specify in §8.0:
- Display family: a humanist serif (e.g., Source Serif Pro / Lora / Newsreader). Body family: a clean sans (Inter or system).
- Numeric family: a mono (JetBrains Mono / IBM Plex Mono) for all dose/volume/concentration figures.
- Background tokens: warm-paper light (`#F8F4EC` light-mode body, `#FFFFFF` cards… no, ditch cards entirely; use ruled separators only). Dark mode: deep-ink background (`#1C1A17`) + parchment text.
- One warning hue (amber `#B26A00`), one action hue (deep ink `#1C1A17` reversed on actions), one success hue (forest `#2E5E3E`).
- Anti-defaults: no `shadow-sm`, no `bg-card border`, no Lucide icons in colored circles, no Recharts default tooltips. Recharts re-themed to match (typography-led axes, no legend chips).

**TD2 — Bottom-nav center action: CENTER-DOCKED LOG BUTTON.** Primary nav becomes:
```
[ Today ] [ Inventory ]   [ + LOG + ]   [ Protocols ] [ More ]
```
- LOG is a 64pt-tall pill that floats up 12pt above the bar baseline; tap → context-aware sheet:
  - If active user has a pending schedule today → pre-fills it; one confirm tap.
  - If not → manual log flow (user → product → batch → dose → method → site).
- Long-press LOG → quick switcher between household members.
- "More" contains Insights, Calculator, Settings, Education library, plus future surfaces.

### Gate verdict: APPROVED

Plan is ready for implementation. Final plan state:
- Architecture: Cloudflare end-to-end (Pages + Workers + D1 + Access) — household-beta only in v1.
- Visual identity: lab-notebook.
- Education: detail-tab only.
- 41 mechanical decisions auto-resolved; 16 TODOs added; 18 DX checklist items.
- Pre-M0 operator bootstrap required before M0 starts.
- M1, M2, M3, M4, M9 prompts must be re-issued to incorporate eng-review corrections (server-stamped timestamps, OCC, mutationId, outbox upgrade, IANA TZ, sanitizer, JWT spec, HMAC claims, indexes, schema parity).
- Test plan artifact written to `~/.gstack/projects/peptide-tracker/alex-main-test-plan-20260429.md`.
- Restore point at `~/.gstack/projects/peptide-tracker/main-autoplan-restore-20260428-165519.md`.



