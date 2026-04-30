// Cloudflare Worker entry. Hono router + auth middleware + sync routes.

import { Hono } from 'hono';
import { authMiddleware } from './auth/devAuth.js';
import { syncRoutes } from './routes/sync.js';
import type { D1Database } from './db/d1.js';
import type { Principal } from './tenant.js';

export interface Env {
  AUTH_MODE: 'dev' | 'prod';
  ENVIRONMENT: 'development' | 'staging' | 'production';
  /** D1 binding — wired in wrangler.toml after `wrangler d1 create`. */
  DB?: D1Database;
  /** Cloudflare Access team domain (e.g., "peptide.cloudflareaccess.com"). prod only. */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access app AUD tag. prod only. */
  ACCESS_AUDIENCE?: string;
  /** ICS feed HMAC signing key. Wired in M9. */
  FEED_HMAC_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Public health check — no auth.
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    authMode: c.env.AUTH_MODE,
    version: '0.1.0',
  });
});

// Everything below requires authentication. authMiddleware sets
// `c.var.principal` (typed via Hono's `c.get('principal' as never)`).
app.use('*', authMiddleware);

app.get('/whoami', (c) => {
  const principal = c.get('principal' as never) as Principal | undefined;
  return c.json({ principal: principal ?? null });
});

app.route('/', syncRoutes());

export default app;
