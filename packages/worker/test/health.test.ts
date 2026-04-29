import { describe, expect, it } from 'vitest';
import app, { type Env } from '../src/index.js';

const env: Env = {
  AUTH_MODE: 'dev',
  ENVIRONMENT: 'development',
};

describe('Worker scaffold', () => {
  it('GET /health returns ok payload', async () => {
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.environment).toBe('development');
    expect(body.authMode).toBe('dev');
  });

  it('GET /whoami returns synthetic principal in dev mode', async () => {
    const res = await app.request('/whoami', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { principal: { email: string } | null };
    expect(body.principal?.email).toBe('alex@household.local');
  });

  it('honors x-dev-as header', async () => {
    const res = await app.request(
      '/whoami',
      { headers: { 'x-dev-as': 'wife@household.local' } },
      env,
    );
    const body = (await res.json()) as { principal: { email: string } | null };
    expect(body.principal?.email).toBe('wife@household.local');
  });

  it('does not inject a principal when AUTH_MODE !== dev', async () => {
    const res = await app.request('/whoami', {}, { ...env, AUTH_MODE: 'prod' });
    const body = (await res.json()) as { principal: unknown };
    expect(body.principal).toBeNull();
  });
});
