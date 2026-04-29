# peptide-tracker

Personal peptide / enzyme / supplement tracker. Local-first PWA + Cloudflare backend.
**Tracking and calculation only — not medical advice.**

> v1 ships as a closed household beta with Cloudflare Access. Consumer signup is
> deferred to v1.5. See `PLAN.md` for the full product and technical plan.

## Quickstart

```bash
# Prereqs: Node 20+, pnpm 9+ (corepack enable && corepack prepare pnpm@9.15.0 --activate)
pnpm install
pnpm dev          # starts web (5173) + worker (8787) concurrently
```

Open <http://localhost:5173>.

## Architecture

Three-package pnpm workspace:

```
packages/
├─ domain/   pure TypeScript — runs in browser AND Worker
├─ web/      Vite + React + Tailwind v3 (lab-notebook identity) PWA
└─ worker/   Cloudflare Worker (Hono) — sync API + ICS feeds (later milestones)
```

Stack-at-a-glance: Pages + Workers + D1 + Access (host-household), Dexie/IndexedDB on the client,
LWW-by-server-stamped-timestamp sync (specified in PLAN.md, lands in M3+M4).

## Local development

`pnpm dev` runs the web app and the Worker concurrently.

The Worker boots in **dev-auth mode**: `AUTH_MODE=dev` injects a synthetic principal so authenticated
routes work without a Cloudflare Access JWT. You'll see one warning per Worker instance:

```
DEV AUTH BYPASS ACTIVE — do not deploy. Set AUTH_MODE=prod for staging/prod.
```

To impersonate a different user in dev, send the header `x-dev-as: someone@household.local`.

## Testing

```bash
pnpm test         # unit tests across all packages (vitest)
pnpm test:e2e     # Playwright smoke (web)
pnpm typecheck    # TypeScript --noEmit, all packages
pnpm lint         # ESLint, all packages
```

## Deploying

Cloudflare Pages (web) + Cloudflare Workers (API). Deployment lands fully in M11.
**Always deploy Worker before Pages** — new Worker routes are additive and backward-compatible;
deploying Pages first against an old Worker breaks new clients. See `PLAN.md` §6.6 of the
autoplan review for the full deploy contract (staging env, expand-then-contract migrations,
rollback procedure, R2 daily backup).

```bash
# Worker
pnpm --filter @peptide/worker deploy:staging
pnpm --filter @peptide/worker deploy

# Pages (M11)
# wrangler pages deploy packages/web/dist
```

## Migrations

Schema parity (Zod → Dexie + Drizzle) lands in M2/M3. The day-to-day workflow:

1. Edit Zod schemas in `packages/domain/src/schemas/`.
2. Run `pnpm migrate:gen` (lands in M3) to regenerate Drizzle + Dexie field lists.
3. Review the diff; commit alongside a Drizzle migration.
4. Apply migrations via `wrangler d1 migrations apply --env staging`, then production.

## Education content

Education / reference notes for tracked items live in detail-tab views, not primary nav.
A `FEATURE_EDUCATION` build flag (M5+) lets you ship a "hostile-reviewer" build with the
Education module stripped entirely.

**Strict rule across the entire codebase:** no dose recommendations, no "safe range" claims,
no curated dose ranges. Educational content shows study data verbatim with citations only.
The user enters their own protocol.

## Troubleshooting

| Symptom                            | Cause                         | Fix                                                          |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| `pnpm: command not found`          | corepack not enabled          | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| Worker returns 401 in dev          | `AUTH_MODE` not set to `dev`  | Check `wrangler.toml` `[vars]` block                         |
| `wrangler dev` fails on D1 binding | D1 not provisioned yet        | Pre-M0 bootstrap: see `SETUP.md`                             |
| Tailwind classes not applying      | postcss/tailwind config drift | `pnpm --filter @peptide/web build` to surface errors         |

## Status

Currently at **M0 — Scaffolding**. See `PLAN.md` for the milestone roadmap (M0-M11) and
the autoplan review report (review consensus, gate decisions, decision audit trail).
