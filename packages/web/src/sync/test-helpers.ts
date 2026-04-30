import type { PushMutation, PushResponse, PullResponse, SyncTransport } from './transport.js';

export interface FakeServerHandlers {
  onPull: (since: string | null) => PullResponse;
  onPush: (mutations: PushMutation[]) => PushResponse;
}

export interface FakeTransport extends SyncTransport {
  callsToPull: Array<{ since: string | null }>;
  callsToPush: Array<{ mutations: PushMutation[] }>;
  failNextPushWith?: { code: string; message: string; status: number } | undefined;
}

export function makeFakeTransport(handlers: FakeServerHandlers): FakeTransport {
  const t: FakeTransport = {
    callsToPull: [],
    callsToPush: [],
    async pull(since) {
      this.callsToPull.push({ since });
      return handlers.onPull(since);
    },
    async push(mutations) {
      this.callsToPush.push({ mutations });
      if (this.failNextPushWith) {
        const err = this.failNextPushWith;
        this.failNextPushWith = undefined;
        const { SyncTransportError } = await import('./transport.js');
        throw new SyncTransportError(err.message, err.status, err.code);
      }
      return handlers.onPush(mutations);
    },
  };
  return t;
}

/** Build a minimal in-memory "server" that mirrors the Worker's behavior:
 *  - holds rows by entity + id
 *  - server-stamps updatedAt + version on accept
 *  - dedupes by mutationId
 *  - returns pulls scoped to a fixed householdId
 */
export interface FakeServer {
  rows: Record<string, Map<string, Record<string, unknown>>>;
  appliedMutations: Map<string, { canonical: Record<string, unknown> }>;
  cursor: string;
  householdId: string;
  pull(since: string | null): PullResponse;
  push(mutations: PushMutation[]): PushResponse;
}

export function makeFakeServer(householdId: string): FakeServer {
  const server: FakeServer = {
    rows: {},
    appliedMutations: new Map(),
    cursor: new Date().toISOString(),
    householdId,
    pull(since) {
      const entities: Record<string, Array<Record<string, unknown>>> = {};
      for (const [entity, rows] of Object.entries(server.rows)) {
        const out: Array<Record<string, unknown>> = [];
        for (const row of rows.values()) {
          const updatedAt = row['updatedAt'] as string | undefined;
          if (since && updatedAt && updatedAt <= since) continue;
          out.push(row);
        }
        if (out.length > 0) entities[entity] = out;
      }
      const cursor = new Date().toISOString();
      server.cursor = cursor;
      return { since, cursor, householdId: server.householdId, entities };
    },
    push(mutations) {
      const results = mutations.map((m) => {
        const cached = server.appliedMutations.get(m.mutationId);
        if (cached) {
          return {
            mutationId: m.mutationId,
            status: 'replayed' as const,
            canonical: cached.canonical,
          };
        }
        if (m.op === 'delete') {
          const table = server.rows[m.entity];
          const row = table?.get(m.id);
          if (row) {
            (row as Record<string, unknown>)['deletedAt'] = new Date().toISOString();
            (row as Record<string, unknown>)['updatedAt'] = new Date().toISOString();
            (row as Record<string, unknown>)['version'] = ((row['version'] as number) ?? 0) + 1;
          }
          const canonical = row ?? { id: m.id, deletedAt: new Date().toISOString() };
          server.appliedMutations.set(m.mutationId, { canonical });
          return {
            mutationId: m.mutationId,
            status: 'applied' as const,
            canonical,
          };
        }
        const table = (server.rows[m.entity] ??= new Map());
        const stamped: Record<string, unknown> = {
          ...m.payload,
          householdId: server.householdId,
          updatedAt: new Date().toISOString(),
          version: m.expectedVersion + 1,
        };
        const id = stamped['id'] as string;
        table.set(id, stamped);
        server.appliedMutations.set(m.mutationId, { canonical: stamped });
        return {
          mutationId: m.mutationId,
          status: 'applied' as const,
          canonical: stamped,
        };
      });
      const cursor = new Date().toISOString();
      server.cursor = cursor;
      return { cursor, results };
    },
  };
  return server;
}
