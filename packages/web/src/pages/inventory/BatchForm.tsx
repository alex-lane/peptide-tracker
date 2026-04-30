import { useState } from 'react';
import { z } from 'zod';
import { getDb, InventoryBatchRepo, newId, nowIso } from '@/db';
import type { InventoryBatch, InventoryItem } from '@/db';

const QUANTITY_UNITS = ['mg', 'mcg', 'mL', 'capsules', 'tablets', 'sprays', 'drops', 'g'] as const;
type QuantityUnit = (typeof QUANTITY_UNITS)[number];

const formSchema = z.object({
  initialQuantity: z.number().positive(),
  initialQuantityUnit: z.enum(QUANTITY_UNITS),
  lotNumber: z.string().max(80).optional(),
  storageLocation: z.string().max(120).optional(),
  expiresAt: z.string().optional(),
  purchasedAt: z.string().optional(),
  purchasePrice: z.number().nonnegative().optional(),
  notesMd: z.string().max(20_000).optional(),
});

interface Props {
  householdId: string;
  item: InventoryItem;
  initial?: InventoryBatch;
  onSaved: (batch: InventoryBatch) => void;
  onCancel: () => void;
}

const PRESET_UNITS_BY_FORM: Record<InventoryItem['form'], QuantityUnit> = {
  injectable_lyophilized: 'mg',
  injectable_solution: 'mL',
  capsule: 'capsules',
  tablet: 'tablets',
  powder_oral: 'g',
  spray_nasal: 'sprays',
  spray_oral: 'sprays',
  drops_oral: 'drops',
  drops_eye: 'drops',
  topical_cream: 'g',
  topical_patch: 'capsules', // patches as count
  supply: 'capsules',
};

export function BatchForm({ householdId, item, initial, onSaved, onCancel }: Props) {
  const [qty, setQty] = useState(initial?.initialQuantity ? String(initial.initialQuantity) : '');
  const [unit, setUnit] = useState<QuantityUnit>(
    (initial?.initialQuantityUnit as QuantityUnit | undefined) ?? PRESET_UNITS_BY_FORM[item.form],
  );
  const [lot, setLot] = useState(initial?.lotNumber ?? '');
  const [location, setLocation] = useState(initial?.storageLocation ?? '');
  const [expires, setExpires] = useState(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '');
  const [purchased, setPurchased] = useState(
    initial?.purchasedAt ? initial.purchasedAt.slice(0, 10) : '',
  );
  const [price, setPrice] = useState(
    initial?.purchasePrice !== undefined ? String(initial.purchasePrice) : '',
  );
  const [notes, setNotes] = useState(initial?.notesMd ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = formSchema.safeParse({
      initialQuantity: qty.trim() ? Number(qty.replace(',', '.')) : NaN,
      initialQuantityUnit: unit,
      lotNumber: lot || undefined,
      storageLocation: location || undefined,
      expiresAt: expires ? `${expires}T00:00:00.000Z` : undefined,
      purchasedAt: purchased ? `${purchased}T00:00:00.000Z` : undefined,
      purchasePrice: price.trim() ? Number(price.replace(',', '.')) : undefined,
      notesMd: notes || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setBusy(true);
    try {
      const repo = new InventoryBatchRepo(getDb());
      const now = nowIso();
      const next: InventoryBatch = initial
        ? {
            ...initial,
            initialQuantity: parsed.data.initialQuantity,
            initialQuantityUnit: parsed.data.initialQuantityUnit,
            lotNumber: parsed.data.lotNumber,
            storageLocation: parsed.data.storageLocation,
            expiresAt: parsed.data.expiresAt,
            purchasedAt: parsed.data.purchasedAt,
            purchasePrice: parsed.data.purchasePrice,
            notesMd: parsed.data.notesMd,
            updatedAt: now,
          }
        : {
            id: newId(),
            householdId,
            createdAt: now,
            updatedAt: now,
            version: 0,
            itemId: item.id,
            initialQuantity: parsed.data.initialQuantity,
            initialQuantityUnit: parsed.data.initialQuantityUnit,
            remainingQuantity: parsed.data.initialQuantity,
            status: 'sealed',
            lotNumber: parsed.data.lotNumber,
            storageLocation: parsed.data.storageLocation,
            expiresAt: parsed.data.expiresAt,
            purchasedAt: parsed.data.purchasedAt,
            purchasePrice: parsed.data.purchasePrice,
            notesMd: parsed.data.notesMd,
          };
      const saved = await repo.upsert(next);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Initial quantity</span>
          <input
            required
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="5"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as QuantityUnit)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            {QUANTITY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="block font-medium">Lot number (optional)</span>
        <input
          value={lot}
          onChange={(e) => setLot(e.target.value)}
          maxLength={80}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-xs"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Purchased</span>
          <input
            type="date"
            value={purchased}
            onChange={(e) => setPurchased(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Sealed expiry</span>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Price (optional)</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="0"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Storage location</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
            placeholder="Fridge, top shelf"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="block font-medium">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-xs"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-paper-300 px-3 py-2 text-sm text-ink-200 hover:bg-paper-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ink-300 px-3 py-2 text-sm text-paper-100 hover:bg-ink-200 disabled:opacity-50"
        >
          {initial ? 'Save changes' : 'Add batch'}
        </button>
      </div>
    </form>
  );
}
