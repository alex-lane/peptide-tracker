import { useMemo, useState } from 'react';
import {
  DoseLogRepo,
  getDb,
  type DoseSchedule,
  type InventoryBatch,
  type InventoryItem,
  type ProtocolItem,
  type UserProfile,
  newId,
  nowIso,
} from '@/db';
import { Modal } from '@/components/Modal';
import {
  buildLogFromSchedule,
  computeAdjustment,
} from './logFromSchedule';
import { siteOptions, methodOptions } from './options';

type Mode =
  | { kind: 'from_schedule'; schedule: DoseSchedule; protocolItem?: ProtocolItem | undefined }
  | { kind: 'manual' };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfile;
  inventoryItems: InventoryItem[];
  inventoryBatches: InventoryBatch[];
  mode: Mode;
}

export function LogDoseModal({
  open,
  onOpenChange,
  user,
  inventoryItems,
  inventoryBatches,
  mode,
}: Props) {
  const initialItemId =
    mode.kind === 'from_schedule'
      ? mode.schedule.itemId
      : (inventoryItems[0]?.id ?? '');
  const [itemId, setItemId] = useState(initialItemId);
  const [batchId, setBatchId] = useState<string | undefined>(() => {
    if (mode.kind === 'from_schedule' && mode.protocolItem?.preferredBatchId) {
      return mode.protocolItem.preferredBatchId;
    }
    const firstBatch = inventoryBatches.find((b) => b.itemId === initialItemId);
    return firstBatch?.id;
  });
  const [doseAmount, setDoseAmount] = useState(
    mode.kind === 'from_schedule' ? String(mode.schedule.doseAmount) : '',
  );
  const [doseUnit, setDoseUnit] = useState<DoseSchedule['doseUnit']>(
    mode.kind === 'from_schedule' ? mode.schedule.doseUnit : 'mcg',
  );
  const [method, setMethod] = useState<DoseSchedule['method']>(
    mode.kind === 'from_schedule' ? mode.schedule.method : 'subq',
  );
  const [site, setSite] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = inventoryItems.find((i) => i.id === itemId);
  const batchesForItem = useMemo(
    () => inventoryBatches.filter((b) => b.itemId === itemId),
    [inventoryBatches, itemId],
  );
  const batch = batchesForItem.find((b) => b.id === batchId);

  const adjustmentPreview = useMemo(() => {
    if (!batch || !doseAmount.trim()) return null;
    const n = Number(doseAmount);
    if (!Number.isFinite(n) || n <= 0) return null;
    const a = computeAdjustment(batch, n, doseUnit);
    return a;
  }, [batch, doseAmount, doseUnit]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!item) throw new Error('Pick a product.');
      const n = Number(doseAmount);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Dose must be a positive number.');

      const db = getDb();
      const repo = new DoseLogRepo(db);

      if (mode.kind === 'from_schedule') {
        const built = buildLogFromSchedule({
          user,
          schedule: mode.schedule,
          protocolItem: mode.protocolItem,
          inventoryItem: item,
          batch,
          doseAmount: n,
          doseUnit,
          ...(site && method !== 'oral' && method !== 'sublingual'
            ? { injectionSite: site as never }
            : {}),
          ...(notes.trim() ? { notesMd: notes } : {}),
        });
        await repo.create({
          log: built.log,
          ...(built.adjustment ? { adjustment: built.adjustment } : {}),
        });
        // Mark the schedule as logged.
        await db.transaction('rw', db.doseSchedules, db.outbox, async () => {
          const fresh = await db.doseSchedules.get(mode.schedule.id);
          if (!fresh) return;
          const next = {
            ...fresh,
            status: 'logged' as const,
            doseLogId: built.log.id,
            updatedAt: nowIso(),
            version: fresh.version + 1,
          };
          await db.doseSchedules.put(next);
          await db.outbox.add({
            mutationId: newId(),
            entity: 'doseSchedule',
            op: 'upsert',
            payload: next,
            createdAt: nowIso(),
            retryCount: 0,
            lastError: null,
            ackedAt: null,
          });
        });
      } else {
        const log = {
          id: newId(),
          householdId: user.householdId,
          userId: user.id,
          itemId,
          ...(batchId ? { batchId } : {}),
          doseAmount: n,
          doseUnit,
          method,
          ...(site && method !== 'oral' && method !== 'sublingual'
            ? { injectionSite: site as never }
            : {}),
          takenAt: nowIso(),
          ...(notes.trim() ? { notesMd: notes } : {}),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          version: 0,
        };
        await repo.create({
          log,
          ...(adjustmentPreview ? { adjustment: adjustmentPreview } : {}),
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const showSite = method === 'subq' || method === 'im' || method === 'iv';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode.kind === 'from_schedule' ? 'Log dose' : 'Manual log'}
      description="Saves a dose log and deducts inventory when possible."
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="block font-medium">Product</span>
          <select
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              const next = inventoryBatches.find((b) => b.itemId === e.target.value);
              setBatchId(next?.id);
            }}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            {inventoryItems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {batchesForItem.length > 0 && (
          <label className="block text-sm">
            <span className="block font-medium">Batch</span>
            <select
              value={batchId ?? ''}
              onChange={(e) => setBatchId(e.target.value === '' ? undefined : e.target.value)}
              className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
            >
              <option value="">— No batch —</option>
              {batchesForItem.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.lotNumber ? `Lot ${b.lotNumber} — ` : ''}
                  {b.remainingQuantity}/{b.initialQuantity} {b.initialQuantityUnit} ({b.status})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm col-span-1">
            <span className="block font-medium">Dose</span>
            <input
              inputMode="decimal"
              value={doseAmount}
              onChange={(e) => setDoseAmount(e.target.value)}
              placeholder="250"
              className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block text-sm col-span-1">
            <span className="block font-medium">Unit</span>
            <select
              value={doseUnit}
              onChange={(e) => setDoseUnit(e.target.value as typeof doseUnit)}
              className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
            >
              <option value="mcg">mcg</option>
              <option value="mg">mg</option>
              <option value="g">g</option>
              <option value="IU">IU</option>
              <option value="capsules">capsules</option>
              <option value="tablets">tablets</option>
              <option value="drops">drops</option>
              <option value="sprays">sprays</option>
              <option value="mL">mL</option>
            </select>
          </label>
          <label className="block text-sm col-span-1">
            <span className="block font-medium">Route</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
            >
              {methodOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showSite && (
          <label className="block text-sm">
            <span className="block font-medium">Injection site (optional)</span>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {siteOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="block font-medium">Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </label>

        {adjustmentPreview ? (
          <p className="text-xs text-ink-100">
            Will deduct{' '}
            <span className="num">
              {Math.abs(adjustmentPreview.delta).toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}
            </span>{' '}
            {adjustmentPreview.unit} from selected batch.
          </p>
        ) : batch ? (
          <p className="text-xs text-warn">
            Inventory deduction can't be computed for this batch + dose unit. The log will save
            without a ledger entry.
          </p>
        ) : null}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm text-ink-100 hover:bg-paper-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-md bg-ink-300 px-3 py-1.5 text-sm text-paper-100 hover:bg-ink-200 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save log'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
