import { useEffect, useState } from 'react';
import { z } from 'zod';
import { getDb, InventoryItemRepo, newId, nowIso } from '@/db';
import type { InventoryItem } from '@/db';
import { labelForm } from './formatting';

const FORMS: ReadonlyArray<InventoryItem['form']> = [
  'injectable_lyophilized',
  'injectable_solution',
  'capsule',
  'tablet',
  'powder_oral',
  'spray_nasal',
  'spray_oral',
  'drops_oral',
  'drops_eye',
  'topical_cream',
  'topical_patch',
];

const formSchema = z.object({
  name: z.string().min(1, 'Required').max(120),
  form: z.enum(FORMS as unknown as [InventoryItem['form'], ...InventoryItem['form'][]]),
  defaultStrengthValue: z
    .string()
    .optional()
    .transform((s) => (s && s.trim() ? Number(s) : undefined))
    .refine((n) => n === undefined || (Number.isFinite(n) && n > 0), 'Must be > 0'),
  defaultStrengthUnit: z.enum(['mcg', 'mg', 'g', 'IU']).optional(),
  defaultUnitOfDose: z
    .enum(['mcg', 'mg', 'g', 'IU', 'mL', 'units', 'capsules', 'tablets', 'drops', 'sprays'])
    .optional(),
  vendor: z.string().max(120).optional(),
  notesMd: z.string().max(20_000).optional(),
});

interface Props {
  householdId: string;
  initial?: InventoryItem;
  onSaved: (item: InventoryItem) => void;
  onCancel: () => void;
}

export function ItemForm({ householdId, initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [form, setForm] = useState<InventoryItem['form']>(
    initial?.form ?? 'injectable_lyophilized',
  );
  const [strengthValue, setStrengthValue] = useState(
    initial?.defaultStrength ? String(initial.defaultStrength.value) : '',
  );
  const [strengthUnit, setStrengthUnit] = useState<'mcg' | 'mg' | 'g' | 'IU'>(
    initial?.defaultStrength?.unit ?? 'mg',
  );
  const [doseUnit, setDoseUnit] = useState(initial?.defaultUnitOfDose ?? 'mcg');
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [notesMd, setNotesMd] = useState(initial?.notesMd ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
  }, [name, form, strengthValue, strengthUnit, doseUnit, vendor, notesMd]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = formSchema.safeParse({
      name,
      form,
      defaultStrengthValue: strengthValue,
      defaultStrengthUnit: strengthUnit,
      defaultUnitOfDose: doseUnit,
      vendor: vendor || undefined,
      notesMd: notesMd || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    const data = parsed.data;
    setBusy(true);
    try {
      const repo = new InventoryItemRepo(getDb());
      const now = nowIso();
      const next: InventoryItem = initial
        ? {
            ...initial,
            name: data.name,
            form: data.form,
            defaultStrength:
              data.defaultStrengthValue !== undefined && data.defaultStrengthUnit
                ? { value: data.defaultStrengthValue, unit: data.defaultStrengthUnit }
                : undefined,
            defaultUnitOfDose: data.defaultUnitOfDose,
            vendor: data.vendor,
            notesMd: data.notesMd,
            updatedAt: now,
          }
        : {
            id: newId(),
            householdId,
            createdAt: now,
            updatedAt: now,
            version: 0,
            name: data.name,
            form: data.form,
            defaultStrength:
              data.defaultStrengthValue !== undefined && data.defaultStrengthUnit
                ? { value: data.defaultStrengthValue, unit: data.defaultStrengthUnit }
                : undefined,
            defaultUnitOfDose: data.defaultUnitOfDose,
            vendor: data.vendor,
            notesMd: data.notesMd,
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="block font-medium">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          placeholder="Sample peptide A"
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium">Form</span>
        <select
          value={form}
          onChange={(e) => setForm(e.target.value as InventoryItem['form'])}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        >
          {FORMS.map((f) => (
            <option key={f} value={f}>
              {labelForm(f)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Strength (optional)</span>
          <input
            inputMode="decimal"
            value={strengthValue}
            onChange={(e) => setStrengthValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="5"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Unit</span>
          <select
            value={strengthUnit}
            onChange={(e) => setStrengthUnit(e.target.value as 'mcg' | 'mg' | 'g' | 'IU')}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="mcg">mcg</option>
            <option value="mg">mg</option>
            <option value="g">g</option>
            <option value="IU">IU</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="block font-medium">Default dose unit</span>
        <select
          value={doseUnit}
          onChange={(e) => setDoseUnit(e.target.value as typeof doseUnit)}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        >
          <option value="mcg">mcg</option>
          <option value="mg">mg</option>
          <option value="g">g</option>
          <option value="IU">IU</option>
          <option value="mL">mL</option>
          <option value="units">insulin units</option>
          <option value="capsules">capsules</option>
          <option value="tablets">tablets</option>
          <option value="drops">drops</option>
          <option value="sprays">sprays</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="block font-medium">Vendor (optional)</span>
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium">Notes (markdown, optional)</span>
        <textarea
          value={notesMd}
          onChange={(e) => setNotesMd(e.target.value)}
          maxLength={20_000}
          rows={3}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-xs"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
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
          {initial ? 'Save changes' : 'Add product'}
        </button>
      </div>
    </form>
  );
}
