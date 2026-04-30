// Cloudflare Access JWT verification with JWKS caching.
// Per autoplan eng review S3: verify (a) signature against
// https://<team>.cloudflareaccess.com/cdn-cgi/access/certs, (b) iss matches
// the team domain, (c) aud matches the Access app AUD tag, (d) exp > now,
// (e) cache JWKS with a 24h TTL but invalidate on kid miss.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { D1Database } from '../db/d1.js';
import { TenantError, type Principal } from '../tenant.js';

export interface AccessConfig {
  teamDomain: string; // e.g. "peptide.cloudflareaccess.com"
  audience: string; // Access app AUD tag
}

export interface VerifyResult {
  email: string;
  payload: JWTPayload;
}

const CF_ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';

let cachedJwks: { teamDomain: string; getKey: ReturnType<typeof createRemoteJWKSet> } | null = null;

function jwksFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks && cachedJwks.teamDomain === teamDomain) return cachedJwks.getKey;
  const url = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
  const getKey = createRemoteJWKSet(url, {
    cacheMaxAge: 24 * 60 * 60 * 1000, // 24h
    cooldownDuration: 30_000, // 30s on kid miss before refetching
  });
  cachedJwks = { teamDomain, getKey };
  return getKey;
}

/**
 * Test-only escape hatch — invalidates the in-process JWKS cache between
 * tests so different team domains can be exercised without contamination.
 */
export function _resetAccessJwksCache(): void {
  cachedJwks = null;
}

/**
 * Verify the Cloudflare Access JWT presented in the request headers.
 * Returns the email + raw payload on success. Throws TenantError on any
 * failure (caller maps to 401).
 */
export async function verifyAccessJwt(
  request: Request,
  config: AccessConfig,
): Promise<VerifyResult> {
  const token = extractToken(request);
  if (!token) throw new TenantError('Missing Access JWT', 401, 'MISSING_JWT');

  const getKey = jwksFor(config.teamDomain);
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, getKey, {
      issuer: `https://${config.teamDomain}`,
      audience: config.audience,
    });
    payload = verified.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JWT verification failed';
    throw new TenantError(`Invalid Access JWT: ${message}`, 401, 'INVALID_JWT');
  }
  if (typeof payload['email'] !== 'string') {
    throw new TenantError('Access JWT missing email claim', 401, 'NO_EMAIL_CLAIM');
  }
  return { email: payload['email'], payload };
}

function extractToken(request: Request): string | null {
  const fromHeader = request.headers.get(CF_ACCESS_JWT_HEADER);
  if (fromHeader) return fromHeader;
  // Fallback: many local proxies forward the cookie variant.
  const cookie = request.headers.get('Cookie') ?? '';
  const m = cookie.match(/CF_Authorization=([^;]+)/);
  return m && m[1] ? m[1] : null;
}

/**
 * Resolve email → (userId, householdId) via the access_users table.
 * Throws if the user is unknown — Access lets them through the edge but
 * we haven't been told who they are. v1 household-beta keeps this row
 * provisioned manually; v1.5 consumer signup populates it via Clerk.
 */
export async function resolvePrincipal(db: D1Database, email: string): Promise<Principal> {
  const row = await db
    .prepare('SELECT user_id, household_id FROM access_users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<{ user_id: string; household_id: string }>();
  if (!row) {
    throw new TenantError(
      `No principal mapping for ${email}. Add a row to access_users.`,
      403,
      'UNKNOWN_PRINCIPAL',
    );
  }
  return { email, userId: row.user_id, householdId: row.household_id };
}
