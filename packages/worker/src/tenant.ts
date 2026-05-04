// withTenant — the ONLY way to read or write the database from a route
// handler. The handler resolves the caller's householdId from the
// authenticated principal, then passes it here. Every read filters by
// household_id; every write injects household_id (ignoring whatever the
// client tried to send).
//
// Per autoplan eng review #4, this is "real defense" only because raw
// `db: D1Database` is intentionally not exported from auth/access.ts —
// the principal-resolved code path is the only way to obtain a working
// db reference inside a request.

import type { D1Database } from './db/d1.js';
import { decodeRow, encodeField } from './db/codec.js';
import { TABLES, type EntityName } from './db/tables.js';

export interface Principal {
  email: string;
  userId: string;
  householdId: string;
}

export interface ScopedDb {
  readonly householdId: string;
  /** /sync/pull: rows updated_at > since OR rows ever-deleted-after-since. */
  pullUpdated(entity: EntityName, since: string | null): Promise<Array<Record<string, unknown>>>;
  /** Idempotent upsert. Server stamps updated_at; OCC enforced on `version`. */
  upsertWithOcc(
    entity: EntityName,
    row: Record<string, unknown>,
    expectedVersion: number,
    serverTimestamp: string,
  ): Promise<{ status: 'applied' | 'conflict'; canonical: Record<string, unknown> }>;
  /** Soft-delete with OCC. */
  softDeleteWithOcc(
    entity: EntityName,
    id: string,
    expectedVersion: number,
    serverTimestamp: string,
  ): Promise<{ status: 'applied' | 'conflict'; canonical: Record<string, unknown> | null }>;
  /** Has this mutationId already been applied? Returns canonical response if so. */
  getProcessedMutation(mutationId: string): Promise<Record<string, unknown> | null>;
  /** Mark a mutation as processed. */
  recordProcessedMutation(args: {
    mutationId: string;
    entity: EntityName;
    op: string;
    response: Record<string, unknown>;
    appliedAt: string;
  }): Promise<void>;
  /** Cross-row FK ownership check — ensures every referenced id belongs to the household. */
  assertOwns(checks: Array<{ entity: EntityName; id: string }>): Promise<void>;
  /**
   * Direct insert-or-replace for non-synced tables (no version, no
   * updatedAt). Server is responsible for stamping householdId BEFORE
   * calling this — the codec writes whatever's in `row`.
   */
  rawInsertOrReplace(entity: EntityName, row: Record<string, unknown>): Promise<void>;
}

export class TenantError extends Error {
  override readonly name = 'TenantError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function withTenant(db: D1Database, principal: Principal): ScopedDb {
  return new ScopedDbImpl(db, principal);
}

class ScopedDbImpl implements ScopedDb {
  constructor(
    private readonly db: D1Database,
    private readonly principal: Principal,
  ) {}

  get householdId(): string {
    return this.principal.householdId;
  }

  async pullUpdated(
    entity: EntityName,
    since: string | null,
  ): Promise<Array<Record<string, unknown>>> {
    const spec = TABLES[entity];
    if (!spec.isSynced) return [];
    const cols = Object.values(spec.columns).join(', ');

    // A0.2 per-entity privacy filters layered on top of the household scope:
    //  - inventory tables: caller sees only items they own OR items shared
    //    with the whole household
    //  - dose_logs and protocols: caller sees only their own
    // Other synced entities keep household-only scoping (today's behavior).
    let privacyClause = '';
    const privacyArgs: unknown[] = [];
    if (
      entity === 'inventoryItem' ||
      entity === 'inventoryBatch' ||
      entity === 'supplyItem'
    ) {
      privacyClause = `AND (creator_user_id = ? OR share_scope = 'household')`;
      privacyArgs.push(this.principal.userId);
    } else if (entity === 'doseLog' || entity === 'protocol') {
      privacyClause = `AND user_id = ?`;
      privacyArgs.push(this.principal.userId);
    }

    const sinceClause = since ? `AND updated_at > ?` : '';
    const sql = `SELECT ${cols} FROM ${spec.table} WHERE household_id = ? ${privacyClause} ${sinceClause} ORDER BY updated_at ASC LIMIT 5000`;
    const args: unknown[] = [this.householdId, ...privacyArgs];
    if (since) args.push(since);

    const stmt = this.db.prepare(sql).bind(...args);
    const result = await stmt.all<Record<string, unknown>>();
    return result.results.map((r) => decodeRow(spec, r));
  }

  async upsertWithOcc(
    entity: EntityName,
    row: Record<string, unknown>,
    expectedVersion: number,
    serverTimestamp: string,
  ): Promise<{ status: 'applied' | 'conflict'; canonical: Record<string, unknown> }> {
    const spec = TABLES[entity];
    if (!spec.hasHousehold) {
      throw new TenantError(`Entity ${entity} is not household-scoped`, 400, 'NOT_TENANT_SCOPED');
    }

    // Server overrides client values for the trust-bearing columns. The
    // client cannot pick householdId, updatedAt, or version.
    const stamped: Record<string, unknown> = {
      ...row,
      householdId: this.householdId,
      updatedAt: serverTimestamp,
      version: expectedVersion + 1,
    };

    // A0.2 server-side stamping for inventory ownership. The creator is
    // always the caller for fresh inserts; we never accept a client-supplied
    // creatorUserId on first write so a malicious client cannot pre-claim
    // ownership for a different member. On update, we preserve whatever the
    // existing row already has (re-fetched below) so creator stickiness is
    // server-authoritative.
    if (
      entity === 'inventoryItem' ||
      entity === 'inventoryBatch' ||
      entity === 'supplyItem'
    ) {
      // shareScope is client-controlled (premise 2: creator chooses), but
      // default to 'private' if absent — matches A0.3 UI default and
      // protects against old clients that don't know about the field.
      if (stamped['shareScope'] === undefined || stamped['shareScope'] === null) {
        stamped['shareScope'] = 'private';
      }
    }

    // Read existing row to enforce OCC. If absent, this is a fresh insert
    // and expectedVersion must be 0.
    const existing = await this.getById(entity, String(stamped.id));
    if (existing) {
      if (existing['householdId'] !== this.householdId) {
        // The id collided with another household's row — refuse.
        throw new TenantError(
          `Cross-household id collision on ${entity}.${String(stamped.id)}`,
          409,
          'CROSS_HOUSEHOLD_ID',
        );
      }
      if (typeof existing['version'] === 'number' && existing['version'] !== expectedVersion) {
        return { status: 'conflict', canonical: existing };
      }
      // Preserve server-authoritative creator across updates so the field
      // can't be flipped by a malicious or buggy client. The existing row
      // is the source of truth.
      if (
        entity === 'inventoryItem' ||
        entity === 'inventoryBatch' ||
        entity === 'supplyItem'
      ) {
        if (existing['creatorUserId']) {
          stamped['creatorUserId'] = existing['creatorUserId'];
        }
      }
    } else if (expectedVersion !== 0) {
      // Client thinks the row exists at some version; we have no row at all.
      return {
        status: 'conflict',
        canonical: { id: stamped.id, missing: true } as Record<string, unknown>,
      };
    } else {
      // Fresh insert: stamp the caller as the creator.
      if (
        entity === 'inventoryItem' ||
        entity === 'inventoryBatch' ||
        entity === 'supplyItem'
      ) {
        stamped['creatorUserId'] = this.principal.userId;
      }
    }

    // Build INSERT OR REPLACE — SQLite's UPSERT.
    const colNames = Object.values(spec.columns);
    const fields = Object.keys(spec.columns);
    const values = fields.map((f) => encodeField(spec, f, stamped[f]));
    const placeholders = colNames.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${spec.table} (${colNames.join(', ')}) VALUES (${placeholders})`;
    await this.db
      .prepare(sql)
      .bind(...values)
      .run();

    return { status: 'applied', canonical: stamped };
  }

  async softDeleteWithOcc(
    entity: EntityName,
    id: string,
    expectedVersion: number,
    serverTimestamp: string,
  ): Promise<{ status: 'applied' | 'conflict'; canonical: Record<string, unknown> | null }> {
    const spec = TABLES[entity];
    if (!spec.isSynced) {
      throw new TenantError(`Entity ${entity} is not soft-deletable`, 400, 'NOT_SOFT_DELETABLE');
    }
    const existing = await this.getById(entity, id);
    if (!existing) return { status: 'applied', canonical: null }; // already absent
    if (existing['householdId'] !== this.householdId) {
      throw new TenantError(
        `Cross-household soft-delete on ${entity}.${id}`,
        403,
        'CROSS_HOUSEHOLD_DELETE',
      );
    }
    if (typeof existing['version'] === 'number' && existing['version'] !== expectedVersion) {
      return { status: 'conflict', canonical: existing };
    }

    const newVersion = expectedVersion + 1;
    const sql = `UPDATE ${spec.table} SET deleted_at = ?, updated_at = ?, version = ? WHERE id = ? AND household_id = ?`;
    await this.db
      .prepare(sql)
      .bind(serverTimestamp, serverTimestamp, newVersion, id, this.householdId)
      .run();

    const canonical = {
      ...existing,
      deletedAt: serverTimestamp,
      updatedAt: serverTimestamp,
      version: newVersion,
    };
    return { status: 'applied', canonical };
  }

  async getProcessedMutation(mutationId: string): Promise<Record<string, unknown> | null> {
    const stmt = this.db
      .prepare(
        'SELECT response_json FROM processed_mutations WHERE household_id = ? AND mutation_id = ?',
      )
      .bind(this.householdId, mutationId);
    const row = await stmt.first<{ response_json: string }>();
    if (!row) return null;
    try {
      return JSON.parse(row.response_json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async recordProcessedMutation(args: {
    mutationId: string;
    entity: EntityName;
    op: string;
    response: Record<string, unknown>;
    appliedAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO processed_mutations (household_id, mutation_id, entity, op, response_json, applied_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(
        this.householdId,
        args.mutationId,
        args.entity,
        args.op,
        JSON.stringify(args.response),
        args.appliedAt,
      )
      .run();
  }

  async assertOwns(checks: Array<{ entity: EntityName; id: string }>): Promise<void> {
    for (const check of checks) {
      const spec = TABLES[check.entity];
      if (!spec.hasHousehold) continue; // child entities (e.g. protocolItem) verified via parent
      const sql = `SELECT 1 AS ok FROM ${spec.table} WHERE id = ? AND household_id = ? LIMIT 1`;
      const row = await this.db
        .prepare(sql)
        .bind(check.id, this.householdId)
        .first<{ ok: number }>();
      if (!row) {
        throw new TenantError(
          `Cross-household FK on ${check.entity}.${check.id}`,
          403,
          'CROSS_HOUSEHOLD_FK',
        );
      }
    }
  }

  async rawInsertOrReplace(entity: EntityName, row: Record<string, unknown>): Promise<void> {
    const spec = TABLES[entity];
    const colNames = Object.values(spec.columns);
    const fields = Object.keys(spec.columns);
    const values = fields.map((f) => encodeField(spec, f, row[f]));
    const placeholders = colNames.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${spec.table} (${colNames.join(', ')}) VALUES (${placeholders})`;
    await this.db
      .prepare(sql)
      .bind(...values)
      .run();
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private async getById(entity: EntityName, id: string): Promise<Record<string, unknown> | null> {
    const spec = TABLES[entity];
    const cols = Object.values(spec.columns).join(', ');
    const sql = `SELECT ${cols} FROM ${spec.table} WHERE id = ? LIMIT 1`;
    const row = await this.db.prepare(sql).bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    return decodeRow(spec, row);
  }
}
