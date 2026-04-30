import type { EntityTable, Transaction } from 'dexie';
import { newId, nowIso } from '../ids.js';
import type { OutboxRow } from '../types.js';
import type { PeptideDb } from '../schema.js';

/**
 * Common shape for every household-scoped, sync-tracked entity. Mirrors the
 * baseEntity Zod schema in @peptide/domain.
 */
export interface BaseRow {
  id: string;
  householdId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  // `string | undefined` (not just `string?`) so that types inferred from
  // Zod schemas — which include `| undefined` in optional fields — satisfy
  // this constraint under `exactOptionalPropertyTypes: true`.
  deletedAt?: string | undefined;
}

export type EntityName = OutboxRow['entity'];

/**
 * Repository helper that wraps every mutating operation in a Dexie
 * transaction across the entity table AND the outbox. The outbox is the
 * single integration point with the server-side sync layer (M3 / M4).
 */
export abstract class Repo<TRow extends BaseRow> {
  constructor(
    protected readonly db: PeptideDb,
    protected readonly table: EntityTable<TRow, 'id'>,
    protected readonly entityName: EntityName,
  ) {}

  /** Find by id. Returns undefined if missing or soft-deleted. */
  async getById(id: string): Promise<TRow | undefined> {
    const row = await this.table.get(id as never);
    if (!row) return undefined;
    if (row.deletedAt) return undefined;
    return row;
  }

  /** List active rows for a household. */
  async listForHousehold(householdId: string): Promise<TRow[]> {
    const rows = await this.table.where('householdId').equals(householdId).toArray();
    return rows.filter((r) => !r.deletedAt);
  }

  /**
   * Insert or update a row. Validation must be done by the caller BEFORE
   * invoking this method — anything thrown inside the Dexie transaction
   * callback aborts cleanly.
   */
  async upsert(row: TRow, tx?: Transaction): Promise<TRow> {
    const stamped: TRow = {
      ...row,
      updatedAt: nowIso(),
      version: row.version + 1,
    };
    const out: OutboxRow = {
      mutationId: newId(),
      entity: this.entityName,
      op: 'upsert',
      payload: stamped,
      createdAt: nowIso(),
      retryCount: 0,
      lastError: null,
      ackedAt: null,
    };

    const work = async () => {
      await this.table.put(stamped);
      await this.db.outbox.add(out);
    };

    if (tx) {
      await work();
    } else {
      await this.db.transaction('rw', this.table, this.db.outbox, work);
    }
    return stamped;
  }

  /**
   * Soft-delete a row. The deletedAt tombstone goes through the outbox just
   * like any other mutation; the server-side sync flips its tombstone.
   */
  async softDelete(id: string, tx?: Transaction): Promise<void> {
    const work = async () => {
      const existing = await this.table.get(id as never);
      if (!existing || existing.deletedAt) return;
      const stamped: TRow = {
        ...existing,
        deletedAt: nowIso(),
        updatedAt: nowIso(),
        version: existing.version + 1,
      };
      await this.table.put(stamped);
      await this.db.outbox.add({
        mutationId: newId(),
        entity: this.entityName,
        op: 'delete',
        payload: { id, deletedAt: stamped.deletedAt },
        createdAt: nowIso(),
        retryCount: 0,
        lastError: null,
        ackedAt: null,
      });
    };

    if (tx) {
      await work();
    } else {
      await this.db.transaction('rw', this.table, this.db.outbox, work);
    }
  }
}

/**
 * Helper for entities that have an explicit `householdId` index but no
 * obvious surrogate key beyond `id` — provides a "build a fresh row" stamp.
 */
export function newBaseRow(input: { householdId: string; id?: string }): BaseRow {
  return {
    id: input.id ?? newId(),
    householdId: input.householdId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 0,
  };
}
