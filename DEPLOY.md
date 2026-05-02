# Deploying to Cloudflare

End-to-end: web app on Pages, API + ICS feeds on Workers, data on D1. Runs
on the free tier.

## One-time setup

```bash
# 1. Authenticate
pnpm --filter @peptide/worker exec wrangler login

# 2. Apply the schema to the remote D1
pnpm deploy:migrate

# 3. Create the Pages project (only needed the first time)
pnpm --filter @peptide/worker exec wrangler pages project create peptide-tracker --production-branch=main
```

The D1 database id is already set in `packages/worker/wrangler.toml` —
`57e43be0-8ef5-4cea-8fc9-6a98fd31a1dc`. If you ever rotate it, update both
`database_id` there and re-run `deploy:migrate`.

## Every deploy

```bash
pnpm deploy
```

That runs:

1. `wrangler deploy` — pushes the Worker. Output URL is something like
   `https://peptide-tracker-worker.<your-account>.workers.dev`. Copy it.
2. `wrangler pages deploy ../web/dist` — builds + uploads the static SPA.
   Output URL is `https://peptide-tracker.pages.dev` (and a per-deploy
   preview URL).

If you only changed one side, run `pnpm deploy:worker` or `pnpm deploy:web`.

## Wire the web app to the Worker

After the first deploy, open the deployed Pages URL on any device, accept
the consent gate, and go to **Settings → Sync**:

- Paste the Worker URL into **Worker URL** (e.g.
  `https://peptide-tracker-worker.<account>.workers.dev`).
- Click **Save config**. Sync starts on the next interval (or hit
  **Force pull** to drain immediately).

The choice persists in IndexedDB, so each device only configures it once.

## Auth modes

`packages/worker/wrangler.toml` ships with three environments:

| Env | `AUTH_MODE` | What it does |
|---|---|---|
| `(default)` | `dev` | Trusts `x-dev-as` / `x-dev-household` headers. Fine for personal use; **do not deploy with this if you ever expose the Worker to the public internet.** |
| `staging` | `prod` | Verifies a Cloudflare Access JWT (`Cf-Access-Jwt-Assertion` header) against `ACCESS_TEAM_DOMAIN` + `ACCESS_AUDIENCE`. |
| `production` | `prod` | Same, with the prod values. |

To deploy under staging or prod auth: `wrangler deploy --env staging`. Set
the env vars first: `wrangler secret put ACCESS_TEAM_DOMAIN --env staging`
etc.

For a private household use case, `AUTH_MODE=dev` behind Cloudflare Access
on the Pages domain itself is the simplest: Access gates the front door,
and the Worker trusts whatever email comes through the dev headers.

## Verify

```bash
# Worker health
curl https://peptide-tracker-worker.<account>.workers.dev/health

# D1 has tables
pnpm --filter @peptide/worker exec wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"

# Pages serving the built SPA
curl -I https://peptide-tracker.pages.dev/
```

The web app's JSON export integrity hash uses `crypto.subtle.digest`. That
API requires HTTPS (or `localhost`). On `*.pages.dev` you're already on
HTTPS — there's a pure-JS SHA-256 fallback in `packages/web/src/db/sha256.ts`
for the LAN-via-IP case, but you'll never hit it on a deployed origin.

## Tearing down

```bash
pnpm --filter @peptide/worker exec wrangler delete peptide-tracker-worker
pnpm --filter @peptide/worker exec wrangler pages project delete peptide-tracker
pnpm --filter @peptide/worker exec wrangler d1 delete peptide-tracker-dev
```
