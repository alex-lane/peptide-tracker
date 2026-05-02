// Cloudflare Worker entry. Hono router + CORS + auth middleware + sync routes.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './auth/devAuth.js';
import { syncRoutes } from './routes/sync.js';
import { feedRoutes } from './routes/feed.js';
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
  /** ICS feed HMAC signing key. Wired in M9 (currently unused since the
   *  hosted-feed flow uses the per-feed nonce as a bearer token). */
  FEED_HMAC_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS — runs FIRST so preflight (OPTIONS) requests don't get caught by the
// auth middleware. The web app calls this Worker from a different origin
// (Vite dev on :5173, deployed pages on a different domain), so without
// this every /sync/push and /sync/pull from the browser fails on preflight.
app.use(
  '*',
  cors({
    // Echo the request origin so credentials work both with the dev server
    // and with deployed Pages. Tighten to a literal allowlist in prod.
    origin: (origin) => origin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'CF-Access-Jwt-Assertion',
      'x-dev-as',
      'x-dev-household',
      'If-None-Match',
    ],
    exposeHeaders: ['ETag'],
    credentials: true,
    maxAge: 600,
  }),
);

// Public health check — no auth. Doubles as the GET / response so a casual
// browser hit doesn't 404.
app.get('/', (c) => c.json({ name: 'peptide-tracker-worker', status: 'ok' }));
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    authMode: c.env.AUTH_MODE,
    version: '0.1.0',
  }),
);

// Feed routes are public — calendar apps subscribe without Cloudflare Access
// credentials. Authorization is via HMAC-signed `?token=...`. Mounted BEFORE
// authMiddleware so the route handler sees the request before auth rejects it.
app.route('/', feedRoutes());

// Everything below requires authentication. authMiddleware sets
// `c.var.principal` (typed via Hono's `c.get('principal' as never)`).
app.use('*', authMiddleware);

app.get('/whoami', (c) => {
  const principal = c.get('principal' as never) as Principal | undefined;
  return c.json({ principal: principal ?? null });
});

app.route('/', syncRoutes());

// Last-resort 404 handler — give a useful body instead of an opaque error.
app.notFound((c) => c.json({ error: 'not found', path: c.req.path }, 404));

// Catch-all error handler so a thrown exception in a route returns 500 with
// a JSON envelope (instead of an empty body that's hard to debug from the
// browser).
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[worker] error:', message);
  return c.json({ error: 'internal_error', message }, 500);
});

export default app;
