import { describe, expect, it } from 'vitest';
import {
  FeedTokenError,
  importHmacKey,
  signFeedToken,
  verifyFeedToken,
  type FeedTokenPayload,
} from './feedToken.js';

const SECRET = 'test-secret-do-not-use-in-prod';

function basePayload(over: Partial<FeedTokenPayload> = {}): FeedTokenPayload {
  return {
    scope: 'user',
    subjectId: 'user-123',
    feedId: 'feed-1',
    iat: 1714521600, // 2024-05-01T00:00:00Z
    v: 1,
    ...over,
  };
}

describe('feedToken', () => {
  it('round-trips a payload through sign / verify', async () => {
    const key = await importHmacKey(SECRET);
    const payload = basePayload();
    const token = await signFeedToken(key, payload);
    const back = await verifyFeedToken(key, token, payload.iat + 60);
    expect(back).toEqual(payload);
  });

  it('rejects a token signed with a different key', async () => {
    const k1 = await importHmacKey(SECRET);
    const k2 = await importHmacKey('different-secret');
    const token = await signFeedToken(k1, basePayload());
    await expect(verifyFeedToken(k2, token)).rejects.toBeInstanceOf(FeedTokenError);
  });

  it('rejects an expired token', async () => {
    const key = await importHmacKey(SECRET);
    const payload = basePayload({ exp: 1714521600 + 100 });
    const token = await signFeedToken(key, payload);
    await expect(
      verifyFeedToken(key, token, 1714521600 + 200),
    ).rejects.toMatchObject({ kind: 'expired' });
  });

  it('rejects a malformed token', async () => {
    const key = await importHmacKey(SECRET);
    await expect(verifyFeedToken(key, 'no-dot-here')).rejects.toMatchObject({
      kind: 'malformed',
    });
    await expect(verifyFeedToken(key, '.')).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('rejects a tampered payload', async () => {
    const key = await importHmacKey(SECRET);
    const token = await signFeedToken(key, basePayload());
    // Mutate the first character of the payload portion. Re-encoded payload
    // means the signature no longer matches.
    const [head, sig] = token.split('.');
    const tampered = `${head!.slice(0, -1)}A.${sig!}`;
    await expect(verifyFeedToken(key, tampered)).rejects.toMatchObject({
      kind: 'bad_signature',
    });
  });

  it('rejects a payload missing required fields', async () => {
    const key = await importHmacKey(SECRET);
    // Sign a payload that's syntactically valid JSON but missing fields. We
    // build it manually to bypass the signFeedToken type check.
    const enc = new TextEncoder();
    const badPayload = enc.encode(JSON.stringify({ hello: 'world' }));
    const b64 = btoa(String.fromCharCode(...badPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(b64));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await expect(verifyFeedToken(key, `${b64}.${sigB64}`)).rejects.toMatchObject({
      kind: 'malformed',
    });
  });
});
