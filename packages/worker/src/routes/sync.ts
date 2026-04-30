import { Hono } from 'hono';
import { z } from 'zod';
import { schemaByEntity, syncEntityName, type SyncEntityName } from '@peptide/domain';
import { TABLES } from '../db/tables.js';
import { TenantError, withTenant, type Principal } from '../tenant.js';
import type { Env } from '../index.js';

const PULL_QUERY_LIMIT = 5000;
const PUSH_BATCH_LIMIT = 200;

// ─── Pull ─────────────────────────────────────────────────────────────

const pullQuery = z.object({
  since: z.string().optional(),
  entities: z.string().optional(), // comma-separated entity names, optional
});

// ─── Push ─────────────────────────────────────────────────────────────

const baseMutation = z.object({
  mutationId: z.string().uuid(),
  entity: syncEntityName,
  expectedVersion: z.number().int().nonnegative(),
});

const pushMutation = z.discriminatedUnion('op', [
  baseMutation.extend({
    op: z.literal('upsert'),
    payload: z.record(z.unknown()),
  }),
  baseMutation.extend({
    op: z.literal('delete'),
    id: z.string().uuid(),
  }),
  baseMutation.extend({
    op: z.literal('compensate'),
    payload: z.record(z.unknown()),
  }),
]);

const pushBody = z.object({
  mutations: z.array(pushMutation).max(PUSH_BATCH_LIMIT),
});

interface PushResultEntry {
  mutationId: string;
  status: 'applied' | 'replayed' | 'conflict' | 'rejected';
  canonical?: Record<string, unknown>;
  error?: { code: string; message: string };
}

// ─── Router ───────────────────────────────────────────────────────────

export function syncRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/sync/pull', async (c) => {
    if (!c.env.DB) {
      return c.json({ error: 'DB_MISSING', message: 'D1 binding missing' }, 500);
    }
    const principal = c.get('principal' as never) as Principal | undefined;
    if (!principal) return c.json({ error: 'UNAUTHENTICATED' }, 401);

    const params = pullQuery.safeParse({
      since: c.req.query('since'),
      entities: c.req.query('entities'),
    });
    if (!params.success) {
      return c.json({ error: 'BAD_QUERY', issues: params.error.issues }, 400);
    }
    const since = params.data.since && params.data.since.length > 0 ? params.data.since : null;

    const requested: SyncEntityName[] = params.data.entities
      ? params.data.entities
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string): s is SyncEntityName =>
            syncEntityName.options.includes(s as SyncEntityName),
          )
      : (Object.keys(TABLES) as SyncEntityName[]);

    if (!c.env.DB) return c.json({ error: 'DB_MISSING' }, 500);
    const scoped = withTenant(c.env.DB, principal);
    const result: Record<string, Array<Record<string, unknown>>> = {};
    let totalRows = 0;
    for (const entity of requested) {
      if (!TABLES[entity].isSynced) continue;
      const rows = await scoped.pullUpdated(entity, since);
      result[entity] = rows;
      totalRows += rows.length;
      if (totalRows >= PULL_QUERY_LIMIT) break;
    }

    const cursor = new Date().toISOString();
    return c.json({ since, cursor, householdId: principal.householdId, entities: result });
  });

  app.post('/sync/push', async (c) => {
    if (!c.env.DB) {
      return c.json({ error: 'DB_MISSING' }, 500);
    }
    const principal = c.get('principal' as never) as Principal | undefined;
    if (!principal) return c.json({ error: 'UNAUTHENTICATED' }, 401);

    let body: z.infer<typeof pushBody>;
    try {
      const json: unknown = await c.req.json();
      body = pushBody.parse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid push body';
      return c.json({ error: 'BAD_BODY', message }, 400);
    }

    const scoped = withTenant(c.env.DB, principal);
    const results: PushResultEntry[] = [];

    for (const m of body.mutations) {
      try {
        const cached = await scoped.getProcessedMutation(m.mutationId);
        if (cached) {
          results.push({ mutationId: m.mutationId, status: 'replayed', canonical: cached });
          continue;
        }

        if (m.op === 'upsert' || m.op === 'compensate') {
          const result = await applyUpsert(scoped, m, principal);
          results.push(result);
        } else {
          const result = await applyDelete(scoped, m);
          results.push(result);
        }
      } catch (err) {
        if (err instanceof TenantError) {
          results.push({
            mutationId: m.mutationId,
            status: 'rejected',
            error: { code: err.code, message: err.message },
          });
        } else {
          const message = err instanceof Error ? err.message : 'Mutation failed';
          results.push({
            mutationId: m.mutationId,
            status: 'rejected',
            error: { code: 'MUTATION_FAILED', message },
          });
        }
      }
    }

    return c.json({ cursor: new Date().toISOString(), results });
  });

  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function applyUpsert(
  scoped: ReturnType<typeof withTenant>,
  m: Extract<z.infer<typeof pushMutation>, { op: 'upsert' | 'compensate' }>,
  principal: Principal,
): Promise<PushResultEntry> {
  const spec = TABLES[m.entity];
  const payload = m.payload as Record<string, unknown>;

  // For sync-tracked entities: validate against the Zod schema BEFORE we
  // do any tenant-scoped work. We use the existing schema by entity, but
  // override the trust-bearing fields (householdId, updatedAt, version)
  // before parse so that legitimate-but-stale client values are accepted.
  // Server stamps real values right after.
  const serverTimestamp = new Date().toISOString();
  const normalized: Record<string, unknown> = {
    ...payload,
    householdId: principal.householdId,
    updatedAt: serverTimestamp,
    version: m.expectedVersion + 1,
  };

  // Skip Zod validation for non-isSynced entities (they don't carry the
  // base shape) — they get validated via their direct schemas below.
  const schema = schemaByEntity[m.entity] as z.ZodTypeAny;
  const toValidate = spec.isSynced ? normalized : payload;
  const parsed = schema.safeParse(toValidate);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i: z.ZodIssue) => i.message).join('; ');
    throw new TenantError(`Validation failed: ${messages}`, 400, 'VALIDATION_FAILED');
  }

  // Cross-row FK ownership check before the write — every referenced id
  // (userId, batchId, itemId, etc.) must belong to this household.
  const fkChecks = await collectFkChecks(m.entity, payload);
  if (fkChecks.length > 0) await scoped.assertOwns(fkChecks);

  if (!spec.isSynced) {
    // Append-only or non-versioned table — write directly without OCC.
    // For inventoryAdjustment we still need the server timestamp + householdId.
    const stamped = stampNonSynced(m.entity, payload, principal, serverTimestamp);
    await writeNonSynced(scoped, m.entity, stamped);
    await scoped.recordProcessedMutation({
      mutationId: m.mutationId,
      entity: m.entity,
      op: m.op,
      response: stamped,
      appliedAt: serverTimestamp,
    });
    return { mutationId: m.mutationId, status: 'applied', canonical: stamped };
  }

  const outcome = await scoped.upsertWithOcc(m.entity, payload, m.expectedVersion, serverTimestamp);

  if (outcome.status === 'conflict') {
    return { mutationId: m.mutationId, status: 'conflict', canonical: outcome.canonical };
  }

  await scoped.recordProcessedMutation({
    mutationId: m.mutationId,
    entity: m.entity,
    op: m.op,
    response: outcome.canonical,
    appliedAt: serverTimestamp,
  });
  return { mutationId: m.mutationId, status: 'applied', canonical: outcome.canonical };
}

async function applyDelete(
  scoped: ReturnType<typeof withTenant>,
  m: Extract<z.infer<typeof pushMutation>, { op: 'delete' }>,
): Promise<PushResultEntry> {
  const serverTimestamp = new Date().toISOString();
  const outcome = await scoped.softDeleteWithOcc(
    m.entity,
    m.id,
    m.expectedVersion,
    serverTimestamp,
  );

  if (outcome.status === 'conflict') {
    return {
      mutationId: m.mutationId,
      status: 'conflict',
      ...(outcome.canonical ? { canonical: outcome.canonical } : {}),
    };
  }

  const canonical = outcome.canonical ?? { id: m.id, deletedAt: serverTimestamp };
  await scoped.recordProcessedMutation({
    mutationId: m.mutationId,
    entity: m.entity,
    op: 'delete',
    response: canonical,
    appliedAt: serverTimestamp,
  });
  return { mutationId: m.mutationId, status: 'applied', canonical };
}

async function collectFkChecks(
  entity: SyncEntityName,
  payload: Record<string, unknown>,
): Promise<Array<{ entity: SyncEntityName; id: string }>> {
  const checks: Array<{ entity: SyncEntityName; id: string }> = [];
  const add = (e: SyncEntityName, idLike: unknown) => {
    if (typeof idLike === 'string' && idLike.length > 0) checks.push({ entity: e, id: idLike });
  };

  switch (entity) {
    case 'inventoryBatch':
      add('inventoryItem', payload['itemId']);
      break;
    case 'doseSchedule':
      add('userProfile', payload['userId']);
      add('inventoryItem', payload['itemId']);
      add('protocolItem' as SyncEntityName, payload['protocolItemId']);
      break;
    case 'doseLog':
      add('userProfile', payload['userId']);
      add('inventoryItem', payload['itemId']);
      add('inventoryBatch', payload['batchId']);
      break;
    case 'inventoryAdjustment':
      add('inventoryBatch', payload['batchId']);
      add('userProfile', payload['byUserId']);
      add('doseLog', payload['refDoseLogId']);
      break;
    case 'protocol':
      add('userProfile', payload['userId']);
      break;
    case 'protocolItem':
      add('protocol', payload['protocolId']);
      add('inventoryItem', payload['itemId']);
      break;
    case 'metricLog':
      add('userProfile', payload['userId']);
      add('customMetric', payload['metricId']);
      break;
    case 'supplyItem':
      add('inventoryItem', payload['itemId']);
      break;
  }
  return checks.filter((c) => c.entity in TABLES);
}

function stampNonSynced(
  entity: SyncEntityName,
  payload: Record<string, unknown>,
  principal: Principal,
  serverTimestamp: string,
): Record<string, unknown> {
  if (entity === 'inventoryAdjustment') {
    return {
      ...payload,
      householdId: principal.householdId,
      createdAt: serverTimestamp,
      byUserId: payload['byUserId'] ?? principal.userId,
    };
  }
  if (entity === 'protocolItem') {
    return { ...payload };
  }
  return {
    ...payload,
    ...(TABLES[entity].hasHousehold ? { householdId: principal.householdId } : {}),
  };
}

async function writeNonSynced(
  scoped: ReturnType<typeof withTenant>,
  entity: SyncEntityName,
  row: Record<string, unknown>,
): Promise<void> {
  // Re-use upsertWithOcc machinery for the codec, but bypass the OCC and
  // version logic by using the dedicated insert paths. For these tables
  // (inventoryAdjustment, protocolItem, metricLog, calendar*, education*),
  // there's no `version` column — we use a direct INSERT OR REPLACE.
  // Implementation reaches into the underlying scoped helper.
  await (
    scoped as unknown as {
      rawInsertOrReplace(entity: SyncEntityName, row: Record<string, unknown>): Promise<void>;
    }
  ).rawInsertOrReplace(entity, row);
}
