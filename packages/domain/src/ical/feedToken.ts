// HMAC-SHA-256 feed-token plumbing. Lives in the domain package because it's
// pure Web-Crypto and runs verbatim in the browser AND in Cloudflare Workers.
//
// Token format: `<base64url(payloadJson)>.<base64url(signature)>`
//
// The payload is application-defined; we keep it small so URLs stay tweetable.
// Treat tokens as opaque from the caller's perspective.

export interface FeedTokenPayload {
  /** Scope: 'user' | 'household'. */
  readonly scope: 'user' | 'household';
  /** ID of the user (if scope='user') or household (if scope='household'). */
  readonly subjectId: string;
  /** ID of the CalendarFeedSettings row this token authorizes. */
  readonly feedId: string;
  /** Issued-at (epoch seconds). */
  readonly iat: number;
  /** Optional expiration (epoch seconds). */
  readonly exp?: number;
  /** Token version. Bumped when the row's `feedToken` is rotated. */
  readonly v: number;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** Issue a signed token. */
export async function signFeedToken(
  key: CryptoKey,
  payload: FeedTokenPayload,
): Promise<string> {
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(ENC.encode(payloadStr));
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

/** Verify a token. Returns the payload on success, throws on failure. */
export async function verifyFeedToken(
  key: CryptoKey,
  token: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<FeedTokenPayload> {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    throw new FeedTokenError('malformed', 'Token missing signature delimiter.');
  }
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const sigBytes = base64UrlDecode(sigB64);
  // Subtle requires BufferSource backed by ArrayBuffer; copy into a fresh one.
  const sigBuffer = new ArrayBuffer(sigBytes.byteLength);
  new Uint8Array(sigBuffer).set(sigBytes);
  const ok = await crypto.subtle.verify('HMAC', key, sigBuffer, ENC.encode(payloadB64));
  if (!ok) {
    throw new FeedTokenError('bad_signature', 'Token signature does not match.');
  }

  let payload: FeedTokenPayload;
  try {
    payload = JSON.parse(DEC.decode(base64UrlDecode(payloadB64))) as FeedTokenPayload;
  } catch {
    throw new FeedTokenError('malformed', 'Token payload is not valid JSON.');
  }

  if (
    !payload ||
    (payload.scope !== 'user' && payload.scope !== 'household') ||
    typeof payload.subjectId !== 'string' ||
    typeof payload.feedId !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.v !== 'number'
  ) {
    throw new FeedTokenError('malformed', 'Token payload missing required fields.');
  }

  if (payload.exp !== undefined && payload.exp < now) {
    throw new FeedTokenError('expired', 'Token has expired.');
  }

  return payload;
}

/** Import a raw key string (utf-8) as an HMAC-SHA-256 verification key. */
export async function importHmacKey(rawSecret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ENC.encode(rawSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export class FeedTokenError extends Error {
  constructor(
    public readonly kind: 'malformed' | 'bad_signature' | 'expired',
    message: string,
  ) {
    super(message);
    this.name = 'FeedTokenError';
  }
}

// ─── base64url codec ──────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(s.length / 4) * 4,
    '=',
  );
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
