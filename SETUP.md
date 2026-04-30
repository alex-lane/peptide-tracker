# SETUP.md — Operator Bootstrap

Before pasting M1 (Domain core) into a Claude Code session, run the interactive
prerequisites here. These cannot be automated by the AI builder: each command
requires a browser handoff, a real Cloudflare account, or a typed value copied
into config.

## 0. Local toolchain

```bash
node --version    # >= 20
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version    # >= 9
```

## 1. Install dependencies

```bash
pnpm install
```

## 2. Cloudflare account

Already have one? Skip this. Otherwise sign up at <https://dash.cloudflare.com>.
Free tier covers everything we need.

## 3. Wrangler login (interactive)

```bash
pnpm --filter @peptide/worker exec wrangler login
```

Opens a browser, authorizes Wrangler, drops a token in `~/.wrangler/`.

## 4. Create the D1 database (run **once per environment**)

Required for M3+. Run these commands and paste the printed `database_id`
into `packages/worker/wrangler.toml`:

```bash
# Development
pnpm --filter @peptide/worker exec wrangler d1 create peptide-tracker-dev

# Staging
pnpm --filter @peptide/worker exec wrangler d1 create peptide-tracker-staging

# Production
pnpm --filter @peptide/worker exec wrangler d1 create peptide-tracker-prod
```

Each command prints something like:

```toml
[[d1_databases]]
binding = "DB"
database_name = "peptide-tracker-dev"
database_id = "abcd1234-..."
```

Paste the `database_id` line under the matching `[env.*]` block in `wrangler.toml`.
Then apply the schema migration:

```bash
# Local (Miniflare)
pnpm --filter @peptide/worker exec wrangler d1 execute peptide-tracker-dev --local --file=migrations/0001_init.sql

# Staging
pnpm --filter @peptide/worker exec wrangler d1 execute peptide-tracker-staging --env staging --remote --file=migrations/0001_init.sql

# Production
pnpm --filter @peptide/worker exec wrangler d1 execute peptide-tracker-prod --env production --remote --file=migrations/0001_init.sql
```

After the schema is in place, populate the `access_users` table for each
household member who should be allowed in:

```bash
pnpm --filter @peptide/worker exec wrangler d1 execute peptide-tracker-dev --local \
  --command="INSERT INTO access_users (email, user_id, household_id, created_at) \
  VALUES ('alex@example.com', 'YOUR_USER_UUID', 'YOUR_HOUSEHOLD_UUID', '$(date -u +%Y-%m-%dT%H:%M:%SZ)')"
```

## 5. Cloudflare Access (required for AUTH_MODE=prod)

For staging/production, set up an Access application:

1. Cloudflare dashboard → Zero Trust → Access → Applications → Add an application.
2. Type: Self-hosted. Application domain: your worker route (e.g. `api.peptide-tracker.example.com`).
3. Identity: email OTP and/or Google.
4. Policy: allowlist your household member emails.
5. Note the **AUD tag** and the **team domain**. Set them as Worker vars in
   `packages/worker/wrangler.toml`:

   ```toml
   [env.staging.vars]
   ACCESS_TEAM_DOMAIN = "yourteam.cloudflareaccess.com"
   ACCESS_AUDIENCE    = "<your-AUD-tag>"
   ```

For local dev, `AUTH_MODE=dev` is the default and a synthetic principal is
injected automatically. Override the dev user via the `x-dev-as` and
`x-dev-household` headers when calling the Worker.

## 6. Worker secrets (deferred to M9)

The ICS feed HMAC key is created in M9:

```bash
pnpm --filter @peptide/worker exec wrangler secret put FEED_HMAC_KEY --env staging
pnpm --filter @peptide/worker exec wrangler secret put FEED_HMAC_KEY --env production
```

Generate a random 32-byte secret first: `openssl rand -hex 32`.

## 7. R2 backup bucket (deferred to M11)

```bash
pnpm --filter @peptide/worker exec wrangler r2 bucket create peptide-tracker-backups
```

Wire a daily cron in `wrangler.toml` (M11) that runs `wrangler d1 export` against the prod DB.

---

## Environment summary

| Variable        | Where                            | Dev           | Staging   | Production   |
| --------------- | -------------------------------- | ------------- | --------- | ------------ |
| `AUTH_MODE`     | wrangler.toml `[vars]`           | `dev`         | `prod`    | `prod`       |
| `ENVIRONMENT`   | wrangler.toml `[vars]`           | `development` | `staging` | `production` |
| D1 binding `DB` | wrangler.toml `[[d1_databases]]` | M3            | M3        | M3           |
| `FEED_HMAC_KEY` | wrangler secret                  | n/a           | M9        | M9           |
| Access AUD      | code (M3)                        | bypassed      | enforced  | enforced     |

## Done?

You should now be able to run:

```bash
pnpm dev          # web at :5173, worker at :8787
curl http://localhost:8787/health       # → {"status":"ok",...}
curl http://localhost:8787/whoami       # → {"principal":{"email":"alex@household.local",...}}
```

If both URLs return JSON, M0 is healthy and you can paste M1 into Claude Code.
