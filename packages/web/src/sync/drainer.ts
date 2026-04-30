import type { PeptideDb } from '../db/schema.js';
import type { OutboxRow } from '../db/types.js';
import type { PushMutation, PushResultEntry, SyncTransport } from './transport.js';
import { SyncTransportError } from './transport.js';

const DEFAULT_BATCH_SIZE = 50;
const MAX_RETRIES = 8;

export interface DrainResult {
  attempted: number;
  applied: number;
  replayed: number;
  conflicts: number;
  rejected: number;
  /** True when the transport is in no-op mode (workerUrl unset). */
  skipped: boolean;
  errors: Array<{ mutationId: string; code: string; message: string }>;
}

/**
 * Drain pending outbox entries to the Worker. The transport is
 * idempotent server-side (mutationId), so retrying after a transient
 * failure is always safe. Per-row retry count + lastError live on the
 * outbox row itself; a row that exhausts MAX_RETRIES is parked (kept in
 * outbox but skipped on subsequent drains until manually retried).
 */
export async function drainOutbox(
  db: PeptideDb,
  transport: SyncTransport,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<DrainResult> {
  const result: DrainResult = {
    attempted: 0,
    applied: 0,
    replayed: 0,
    conflicts: 0,
    rejected: 0,
    skipped: false,
    errors: [],
  };

  const candidates = await pickPending(db, batchSize);
  if (candidates.length === 0) return result;

  const mutations = candidates.map(toMutation);
  result.attempted = mutations.length;

  let response;
  try {
    response = await transport.push(mutations);
  } catch (err) {
    if (err instanceof SyncTransportError) {
      // Transport-level failure: bump retry count on every candidate.
      await Promise.all(candidates.map((row) => bumpRetry(db, row, `${err.code}: ${err.message}`)));
      result.errors.push({
        mutationId: '*',
        code: err.code,
        message: err.message,
      });
      return result;
    }
    throw err;
  }

  if (response === null) {
    result.skipped = true;
    return result;
  }

  const byMutationId = new Map<string, PushResultEntry>();
  for (const entry of response.results) byMutationId.set(entry.mutationId, entry);

  for (const row of candidates) {
    const entry = byMutationId.get(row.mutationId);
    if (!entry) {
      // Worker didn't return this mutation — bump retry to try again later.
      await bumpRetry(db, row, 'No result returned by Worker');
      result.errors.push({
        mutationId: row.mutationId,
        code: 'MISSING_RESULT',
        message: 'No result returned',
      });
      continue;
    }
    switch (entry.status) {
      case 'applied':
        result.applied += 1;
        await ack(db, row);
        break;
      case 'replayed':
        result.replayed += 1;
        await ack(db, row);
        break;
      case 'conflict':
        // Conflict means the server holds a newer canonical row. The next
        // pull will deliver it and the client will merge. Acknowledge the
        // outbox entry so we don't push the stale row again.
        result.conflicts += 1;
        await ack(db, row);
        result.errors.push({
          mutationId: row.mutationId,
          code: 'CONFLICT',
          message: 'Server has a newer version; will merge on next pull',
        });
        break;
      case 'rejected':
        result.rejected += 1;
        await bumpRetry(
          db,
          row,
          `${entry.error?.code ?? 'REJECTED'}: ${entry.error?.message ?? 'unknown'}`,
        );
        result.errors.push({
          mutationId: row.mutationId,
          code: entry.error?.code ?? 'REJECTED',
          message: entry.error?.message ?? 'rejected',
        });
        break;
    }
  }

  return result;
}

/** Manually retry a parked entry — clears retryCount + lastError. */
export async function unparkOutbox(db: PeptideDb, outboxId: number): Promise<void> {
  const row = await db.outbox.get(outboxId);
  if (!row) return;
  await db.outbox.put({ ...row, retryCount: 0, lastError: null });
}

/** Outstanding (un-acked, not-parked) outbox depth — surfaces in the UI. */
export async function pendingCount(db: PeptideDb): Promise<number> {
  const all = await db.outbox.toArray();
  return all.filter((r) => r.ackedAt === null && r.retryCount < MAX_RETRIES).length;
}

// ─── Internal ─────────────────────────────────────────────────────────

async function pickPending(db: PeptideDb, n: number): Promise<OutboxRow[]> {
  // Dexie can't filter on null directly via index, so we scan ordered by
  // id (insertion order) and stop at n. Outbox is small relative to the
  // entity tables; this is fine.
  const all = await db.outbox.orderBy('id').toArray();
  return all.filter((r) => r.ackedAt === null && r.retryCount < MAX_RETRIES).slice(0, n);
}

function toMutation(row: OutboxRow): PushMutation {
  // The payload was already validated against the domain Zod schema when
  // the originating repo enqueued it (M2). The Worker re-validates anyway.
  const payload = row.payload as Record<string, unknown>;
  const expectedVersion =
    typeof payload['version'] === 'number' ? Math.max(0, (payload['version'] as number) - 1) : 0;

  if (row.op === 'delete') {
    const id = (payload as { id?: string })['id'] ?? '';
    return {
      mutationId: row.mutationId,
      entity: row.entity,
      op: 'delete',
      expectedVersion,
      id,
    };
  }
  return {
    mutationId: row.mutationId,
    entity: row.entity,
    op: row.op,
    expectedVersion,
    payload,
  };
}

async function ack(db: PeptideDb, row: OutboxRow): Promise<void> {
  await db.outbox.put({
    ...row,
    ackedAt: new Date().toISOString(),
    lastError: null,
  });
}

async function bumpRetry(db: PeptideDb, row: OutboxRow, error: string): Promise<void> {
  await db.outbox.put({
    ...row,
    retryCount: row.retryCount + 1,
    lastError: error,
  });
}
