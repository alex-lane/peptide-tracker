# Contributing

Personal project; contributions limited until v1.5+. The notes below are for
future-you (or a future contributor) returning to the codebase.

## Hard rules

These are codified in every milestone prompt and apply to all code:

1. **Never embed dosage recommendations**, "safe ranges," or drug-specific clinical guidance. The user supplies all protocols.
2. **Never include lookup tables, presets, or seed data with real peptide names + doses.**
3. **Domain math files** start with the comment `// This file performs unit math only. It does not advise on dose safety. The user is responsible for their own protocol.`
4. **All dose math has unit tests.** All inventory deductions have unit tests. Property-based tests for unit conversions are required.
5. **`packages/domain/`** is framework-free pure TypeScript — no React, no Dexie, no Drizzle, no DOM, no `node:` imports.
6. **Zod at every boundary** (forms, JSON import, sync). Branded types for `Mcg`, `Mg`, `Ml`, `InsulinUnits`.
7. **Calculator UIs surface the formula and the inputs used** in a "Show your work" panel.
8. **pnpm only** — no npm, no yarn.
9. **Node 20+, TypeScript strict** (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`).
10. **kebab-case files / PascalCase components.**
11. **One commit per milestone**, conventional-commits format (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Workflow

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e        # Playwright, web only
pnpm format          # prettier write
```

## Adding a column

(Lands fully in M2/M3.)

1. Edit the Zod schema in `packages/domain/src/schemas/`.
2. Run `pnpm migrate:gen` (M3) to regenerate Drizzle + Dexie field lists.
3. Inspect the diff. Commit Zod + generated files together.
4. Write a Drizzle migration via `drizzle-kit generate`.
5. Apply locally: `pnpm --filter @peptide/worker exec wrangler d1 migrations apply peptide-tracker-dev --local`.
6. Apply staging: `pnpm --filter @peptide/worker exec wrangler d1 migrations apply peptide-tracker-staging --env staging --remote`.
7. Apply production: same with `--env production`.
8. Deploy Worker first, then Pages.

## Education content

Per-product educational notes live under `packages/web/src/features/education/content/` (M5+).
They are markdown with structured frontmatter:

```yaml
---
slug: bpc-157
class: research peptide
half_life: <study citation>
route: <study citation>
side_effects:
  - <study citation>
citations:
  - title: <study title>
    url: <pubmed/doi>
regulatory_note: <jurisdiction note>
---
```

**No dose ranges. No "typical dose." No "recommended."** Show study-reported doses
**only as direct quotations** from cited studies, never as a UI-rendered field.
A lint check (M5) enforces this.
