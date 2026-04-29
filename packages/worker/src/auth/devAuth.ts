import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

let warned = false;

/**
 * Dev-mode auth bypass.
 * - When AUTH_MODE === 'dev', injects a synthetic principal so authenticated
 *   routes work under `wrangler dev` without a real Cloudflare Access JWT.
 * - Logs a one-time warning per Worker instance.
 * - In any other AUTH_MODE this middleware does nothing; real JWT verification
 *   is added in M3 alongside Cloudflare Access JWKS handling.
 */
export async function devAuth(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.env.AUTH_MODE === 'dev') {
    if (!warned) {
      console.warn('DEV AUTH BYPASS ACTIVE — do not deploy. Set AUTH_MODE=prod for staging/prod.');
      warned = true;
    }
    const headerOverride = c.req.header('x-dev-as');
    const email = headerOverride ?? 'alex@household.local';
    c.set('principal' as never, {
      email,
      userId: `dev-user-${email}`,
      householdId: 'dev-household',
    });
  }
  await next();
}
