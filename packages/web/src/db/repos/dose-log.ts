import { doseLog as doseLogSchema, inventoryAdjustment as adjustmentSchema } from '@peptide/domain';
import type { DoseLog, InventoryAdjustment, OutboxRow } from '../types.js';
import type { PeptideDb } from '../schema.js';
import { newId, nowIso } from '../ids.js';
import { Repo } from './base.js';

export interface CreateDoseLogInput {
  log: DoseLog;
  /**
   * Optional: an explicit ledger debit. When omitted, no inventory
   * adjustment is written (e.g., dose taken from a vial that the user
   * does not track inventory for).
   */
  adjustment?: {
    batchId: string;
    delta: number;
    unit: InventoryAdjustment['unit'];
    reason: InventoryAdjustment['reason'];
  };
}

export interface CreateDoseLogResult {
  log: DoseLog;
  adjustment?: InventoryAdjustment;
}

/**
 * DoseLogRepo writes the DoseLog + InventoryAdjustment + outbox entries
 * in a single Dexie transaction. The validate-before-tx pattern keeps
 * the transaction body pure I/O so that any throw aborts cleanly.
 */
export class DoseLogRepo extends Repo<DoseLog> {
  constructor(db: PeptideDb) {
    super(db, db.doseLogs, 'doseLog');
  }

  async create(input: CreateDoseLogInput): Promise<CreateDoseLogResult> {
    // 1. Validate everything BEFORE opening the transaction. Anything that
    //    can throw at parse time should throw here, not inside the tx body.
    const stampedLog: DoseLog = {
      ...input.log,
      createdAt: input.log.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      version: input.log.version ?? 0,
    };
    doseLogSchema.parse(stampedLog);

    let stampedAdjustment: InventoryAdjustment | undefined;
    if (input.adjustment) {
      stampedAdjustment = adjustmentSchema.parse({
        id: newId(),
        householdId: stampedLog.householdId,
        batchId: input.adjustment.batchId,
        delta: input.adjustment.delta,
        unit: input.adjustment.unit,
        reason: input.adjustment.reason,
        refDoseLogId: stampedLog.id,
        mutationId: newId(),
        byUserId: stampedLog.userId,
        createdAt: nowIso(),
      });
    }

    // 2. Build outbox entries up-front so the tx body is purely DB writes.
    const logOutbox: OutboxRow = {
      mutationId: newId(),
      entity: 'doseLog',
      op: 'upsert',
      payload: stampedLog,
      createdAt: nowIso(),
      retryCount: 0,
      lastError: null,
      ackedAt: null,
    };
    const adjOutbox: OutboxRow | undefined = stampedAdjustment
      ? {
          mutationId: stampedAdjustment.mutationId,
          entity: 'inventoryAdjustment',
          op: 'upsert',
          payload: stampedAdjustment,
          createdAt: nowIso(),
          retryCount: 0,
          lastError: null,
          ackedAt: null,
        }
      : undefined;

    // 3. Atomic write across three tables.
    await this.db.transaction(
      'rw',
      this.db.doseLogs,
      this.db.inventoryAdjustments,
      this.db.outbox,
      async () => {
        await this.db.doseLogs.put(stampedLog);
        if (stampedAdjustment) {
          await this.db.inventoryAdjustments.put(stampedAdjustment);
        }
        await this.db.outbox.add(logOutbox);
        if (adjOutbox) {
          await this.db.outbox.add(adjOutbox);
        }
      },
    );

    return stampedAdjustment
      ? { log: stampedLog, adjustment: stampedAdjustment }
      : { log: stampedLog };
  }

  /**
   * Compensating Undo: writes a soft-delete on the DoseLog, a compensating
   * InventoryAdjustment that exactly cancels the original ledger entry,
   * and the matching outbox entries — all in one transaction.
   *
   * Refuses to compensate a DoseLog that's already soft-deleted.
   */
  async undo(doseLogId: string): Promise<void> {
    const log = await this.db.doseLogs.get(doseLogId);
    if (!log) throw new Error(`DoseLog ${doseLogId} not found`);
    if (log.deletedAt) throw new Error(`DoseLog ${doseLogId} already undone`);

    // Find the original ledger debit (if any).
    const originalAdj = await this.db.inventoryAdjustments
      .where('[householdId+mutationId]')
      .equals([log.householdId, ''])
      .filter((a) => a.refDoseLogId === doseLogId)
      .first();

    // Note: the index above with empty mutationId returns nothing — fall back
    // to a scan across the household's adjustments when needed. Since this is
    // an Undo path (rare, user-initiated), the linear scan is fine.
    const adjustments = originalAdj
      ? [originalAdj]
      : (
          await this.db.inventoryAdjustments.where('householdId').equals(log.householdId).toArray()
        ).filter((a) => a.refDoseLogId === doseLogId);

    const undeletedLog: DoseLog = {
      ...log,
      deletedAt: nowIso(),
      updatedAt: nowIso(),
      version: log.version + 1,
    };

    const compensations: InventoryAdjustment[] = adjustments.map((orig) => ({
      id: newId(),
      householdId: orig.householdId,
      batchId: orig.batchId,
      delta: -orig.delta,
      unit: orig.unit,
      reason: 'manual_correction',
      refDoseLogId: doseLogId,
      mutationId: newId(),
      byUserId: log.userId,
      createdAt: nowIso(),
    }));

    await this.db.transaction(
      'rw',
      this.db.doseLogs,
      this.db.inventoryAdjustments,
      this.db.outbox,
      async () => {
        await this.db.doseLogs.put(undeletedLog);
        await this.db.outbox.add({
          mutationId: newId(),
          entity: 'doseLog',
          op: 'delete',
          payload: { id: doseLogId, deletedAt: undeletedLog.deletedAt },
          createdAt: nowIso(),
          retryCount: 0,
          lastError: null,
          ackedAt: null,
        });
        for (const comp of compensations) {
          await this.db.inventoryAdjustments.put(comp);
          await this.db.outbox.add({
            mutationId: comp.mutationId,
            entity: 'inventoryAdjustment',
            op: 'compensate',
            payload: comp,
            createdAt: nowIso(),
            retryCount: 0,
            lastError: null,
            ackedAt: null,
          });
        }
      },
    );
  }
}
