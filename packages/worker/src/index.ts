// Cloudflare Worker entry. Hono router + dev-mode auth bypass.
// Real JWT verification, /sync routes, and /feed routes land in M3 / M9.

import { Hono } from 'hono';
import { devAuth } from './auth/devAuth.js';

export interface Env {
  AUTH_MODE: 'dev' | 'prod';
  ENVIRONMENT: 'development' | 'staging' | 'production';
  // DB: D1Database;        // wired in M3
  // FEED_HMAC_KEY: string; // wired in M9
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    authMode: c.env.AUTH_MODE,
    version: '0.0.0',
  });
});

// Dev-mode auth bypass — gated by AUTH_MODE === 'dev'. Logs a warning and
// injects a synthetic principal so wrangler dev can exercise authenticated
// flows without an Access JWT. Production deploys MUST set AUTH_MODE=prod.
app.use('*', devAuth);

app.get('/whoami', (c) => {
  const principal = c.get('principal' as never) as { email: string; userId: string } | undefined;
  return c.json({ principal: principal ?? null });
});

export default app;
