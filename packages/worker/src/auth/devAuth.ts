import type { Context, Next } from 'hono';
import type { Env } from '../index.js';
import { resolvePrincipal, verifyAccessJwt } from './access.js';
import { TenantError, type Principal } from '../tenant.js';

let warned = false;

/**
 * Auth middleware. Two modes:
 *
 * - AUTH_MODE=dev: skip JWT verification entirely. Inject a synthetic
 *   principal so `wrangler dev` can exercise authenticated flows. Logs a
 *   one-time warning. Reads `x-dev-as` header to switch users.
 *
 * - AUTH_MODE=prod: verify the Cloudflare Access JWT (signature + iss +
 *   aud + exp), then resolve email → principal via access_users table.
 *   On any failure, returns 401/403 with a structured TenantError code.
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.env.AUTH_MODE === 'dev') {
    if (!warned) {
      console.warn('DEV AUTH BYPASS ACTIVE — do not deploy. Set AUTH_MODE=prod for staging/prod.');
      warned = true;
    }
    // Deterministic UUID v5-ish defaults so the Worker's Zod schemas
    // (which require uuid() on every id field) accept the synthetic
    // principal even when the client doesn't supply the dev headers.
    // Real clients should send x-dev-as / x-dev-household via the engine.
    const DEFAULT_DEV_HOUSEHOLD = '00000000-0000-4000-8000-000000000001';
    const DEFAULT_DEV_USER = '00000000-0000-4000-8000-000000000002';
    const headerOverride = c.req.header('x-dev-as');
    const email = headerOverride ?? 'alex@household.local';
    const userIdFromHeader = isUuid(headerOverride) ? headerOverride : null;
    const householdHeader = c.req.header('x-dev-household');
    const householdId = isUuid(householdHeader)
      ? (householdHeader as string)
      : DEFAULT_DEV_HOUSEHOLD;
    const principal: Principal = {
      email,
      userId: userIdFromHeader ?? DEFAULT_DEV_USER,
      householdId,
    };
    c.set('principal' as never, principal);
    await next();
    return;
  }

  // Production path.
  if (!c.env.ACCESS_TEAM_DOMAIN || !c.env.ACCESS_AUDIENCE) {
    return c.json(
      { error: 'AUTH_MISCONFIGURED', message: 'Access team domain + audience required' },
      500,
    );
  }
  if (!c.env.DB) {
    return c.json({ error: 'AUTH_MISCONFIGURED', message: 'D1 binding missing' }, 500);
  }
  try {
    const { email } = await verifyAccessJwt(c.req.raw, {
      teamDomain: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_AUDIENCE,
    });
    const principal = await resolvePrincipal(c.env.DB, email);
    c.set('principal' as never, principal);
  } catch (err) {
    if (err instanceof TenantError) {
      return c.json({ error: err.code, message: err.message }, err.status as 401 | 403 | 500);
    }
    throw err;
  }
  await next();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string | undefined | null): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
