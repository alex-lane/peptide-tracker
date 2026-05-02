import type { SyncEntityName } from '@peptide/domain';
import type { SyncConfig } from './config.js';

// Wire format mirrors packages/worker/src/routes/sync.ts.

export interface PullResponse {
  since: string | null;
  cursor: string;
  householdId: string;
  entities: Record<string, Array<Record<string, unknown>>>;
}

export type PushOp = 'upsert' | 'delete' | 'compensate';

export interface PushMutationUpsert {
  mutationId: string;
  entity: SyncEntityName;
  expectedVersion: number;
  op: 'upsert' | 'compensate';
  payload: Record<string, unknown>;
}
export interface PushMutationDelete {
  mutationId: string;
  entity: SyncEntityName;
  expectedVersion: number;
  op: 'delete';
  id: string;
}
export type PushMutation = PushMutationUpsert | PushMutationDelete;

export interface PushResultEntry {
  mutationId: string;
  status: 'applied' | 'replayed' | 'conflict' | 'rejected';
  canonical?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface PushResponse {
  cursor: string;
  results: PushResultEntry[];
}

export class SyncTransportError extends Error {
  override readonly name = 'SyncTransportError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Transport interface — abstracts fetch so tests can inject a fake.
 * Returns null for both calls when the Worker URL is unset (no-op mode).
 */
export interface SyncTransport {
  pull(since: string | null, entities?: SyncEntityName[]): Promise<PullResponse | null>;
  push(mutations: PushMutation[]): Promise<PushResponse | null>;
}

export function createTransport(
  getConfig: () => SyncConfig,
  fetcher: typeof fetch = fetch,
): SyncTransport {
  return {
    async pull(since, entities) {
      const cfg = getConfig();
      if (!cfg.workerUrl) return null;
      const url = new URL('/sync/pull', cfg.workerUrl);
      if (since) url.searchParams.set('since', since);
      if (entities && entities.length > 0) url.searchParams.set('entities', entities.join(','));
      const res = await fetcher(url.toString(), {
        method: 'GET',
        headers: buildHeaders(cfg),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new SyncTransportError(text || res.statusText, res.status, 'PULL_FAILED');
      }
      return (await res.json()) as PullResponse;
    },
    async push(mutations) {
      const cfg = getConfig();
      if (!cfg.workerUrl) return null;
      const url = new URL('/sync/push', cfg.workerUrl);
      const res = await fetcher(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...buildHeaders(cfg) },
        body: JSON.stringify({ mutations }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new SyncTransportError(text || res.statusText, res.status, 'PUSH_FAILED');
      }
      return (await res.json()) as PushResponse;
    },
  };
}

function buildHeaders(cfg: SyncConfig): Record<string, string> {
  const h: Record<string, string> = {};
  // Prefer the explicit Settings → Dev overrides; fall back to the active
  // household/user resolved by the engine. The fallback is what makes
  // sync work without the user typing UUIDs into Settings.
  const devAs = cfg.devAs || cfg.activeUserEmail;
  const devHousehold = cfg.devHousehold || cfg.activeHouseholdId;
  if (devAs) h['x-dev-as'] = devAs;
  if (devHousehold) h['x-dev-household'] = devHousehold;
  return h;
}
