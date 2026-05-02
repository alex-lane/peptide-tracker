# Deploying to Cloudflare

End-to-end: web app on Pages, API + ICS feeds on Workers, data on D1. Free tier.

## Recommended: auto-deploy on push to main

`.github/workflows/deploy.yml` runs on every push to `main` and on manual
**workflow_dispatch** from the Actions tab. It:

1. Installs deps + runs typecheck + runs the full test suite (any red →
   no deploy)
2. Builds `packages/web/dist`
3. Deploys the Worker via `cloudflare/wrangler-action@v3`
4. Deploys Pages from `packages/web/dist` to project `peptide-tracker`

### One-time GitHub setup

Add two secrets to the repo (`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token with **Workers Scripts: Edit**, **Cloudflare Pages: Edit**, **D1: Edit** scopes. Create at <https://dash.cloudflare.com/profile/api-tokens>. |
| `CLOUDFLARE_ACCOUNT_ID` | Your account id from any Cloudflare dashboard URL (`https://dash.cloudflare.com/<id>/...`). |

That's it. Push to main and watch the Actions tab.

### One-time Cloudflare setup (only the first time, run locally)

```bash
# Auth your local wrangler so the create commands have access.
pnpm --filter @peptide/worker exec wrangler login

# Apply the schema to the remote D1.
pnpm deploy:migrate

# Create the Pages project (only first time).
pnpm --filter @peptide/web exec wrangler pages project create peptide-tracker \
  --production-branch=main
```

The D1 database id is already pinned in `packages/worker/wrangler.toml`
(`57e43be0-8ef5-4cea-8fc9-6a98fd31a1dc`). If you rotate it, update
`database_id` there and re-run `deploy:migrate`.

## Manual / one-shot deploy

For a quick deploy without going through CI:

```bash
pnpm deploy            # both
pnpm deploy:worker     # just the Worker
pnpm deploy:web        # just Pages (build + upload)
pnpm deploy:migrate    # apply remote D1 migrations
```

## Wire the web app to the Worker

After the first deploy, open the Pages URL on any device, accept the
consent gate, and go to **Settings → Sync**:

- Paste the Worker URL (e.g.
  `https://peptide-tracker-worker.<account>.workers.dev`).
- Click **Save config**. Hit **Force pull** to drain immediately, or wait
  for the next interval.

The choice persists in IndexedDB, so each device only configures it once.

## Why not the Cloudflare Pages dashboard git integration?

Cloudflare's dashboard-managed Pages builds run a single command and look
for one output dir, with no first-class pnpm workspace support. In a
monorepo where the build needs the workspace `@peptide/domain` package
linked, that path is fragile. The Actions workflow above runs `pnpm
install --frozen-lockfile` once and builds with the full workspace
resolved, which "just works."

If you'd rather use the dashboard anyway: connect the repo, set
**Build command** to `pnpm install --frozen-lockfile && pnpm --filter
@peptide/web build`, **Build output dir** to `packages/web/dist`,
**Root dir** to `/`, **Node version** to `20`. The Worker still needs
`wrangler deploy` (or this Actions workflow) — Pages git deploys don't
touch Workers.

## Auth modes

`packages/worker/wrangler.toml` ships with three environments:

| Env | `AUTH_MODE` | What it does |
|---|---|---|
| `(default)` | `dev` | Trusts `x-dev-as` / `x-dev-household` headers. **Don't deploy with this if the Worker is exposed to the public internet.** |
| `staging` | `prod` | Verifies a Cloudflare Access JWT. |
| `production` | `prod` | Same, prod values. |

For staging/prod auth: change the workflow's `command:` to `deploy --env
staging`, and set the env vars first via `wrangler secret put
ACCESS_TEAM_DOMAIN --env staging` etc.

For a private household use case, the simplest setup is `AUTH_MODE=dev`
on the Worker behind **Cloudflare Access** in front of the Pages domain
(and optionally the Worker subdomain). Access gates the front door,
the Worker trusts the email.

## Verify

```bash
# Worker health
curl https://peptide-tracker-worker.<account>.workers.dev/health

# D1 has tables
pnpm --filter @peptide/worker exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"

# Pages serving the SPA
curl -I https://peptide-tracker.pages.dev/
```

The web app's JSON export integrity hash uses `crypto.subtle.digest`. That
API requires HTTPS (or `localhost`). Pages serves over HTTPS — there's a
pure-JS SHA-256 fallback in `packages/web/src/db/sha256.ts` for the LAN
dev case, but you'll never hit it on the deployed origin.

## Tearing down

```bash
pnpm --filter @peptide/worker exec wrangler delete peptide-tracker-worker
pnpm --filter @peptide/web exec wrangler pages project delete peptide-tracker
pnpm --filter @peptide/worker exec wrangler d1 delete peptide-tracker-dev
```
