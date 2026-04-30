/**
 * Stable UUID v4 generator. crypto.randomUUID() is available in:
 *   - All evergreen browsers
 *   - Cloudflare Workers
 *   - Node 19+
 * fake-indexeddb's Vitest test environment provides crypto.randomUUID via
 * Node's built-in webcrypto. No polyfill needed.
 */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO datetime string with millisecond precision and a Z suffix. */
export function nowIso(): string {
  return new Date().toISOString();
}
