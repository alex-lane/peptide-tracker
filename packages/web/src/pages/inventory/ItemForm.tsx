import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, Users } from 'lucide-react';
import { z } from 'zod';
import { getDb, InventoryItemRepo, newId, nowIso } from '@/db';
import type { InventoryItem } from '@/db';
import { listUsersInHousehold } from '@/app/active-household';
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
  activeUserId: string;
  initial?: InventoryItem;
  onSaved: (item: InventoryItem) => void;
  onCancel: () => void;
}

export function ItemForm({ householdId, activeUserId, initial, onSaved, onCancel }: Props) {
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
  // Premise 2 default (autoplan-adjudicated): new items are private.
  // Editing an existing item preserves whatever scope it already has.
  const [shareScope, setShareScope] = useState<'private' | 'household'>(
    initial?.shareScope ?? 'private',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hide the share toggle entirely when the household has only one
  // member — there's nobody to share WITH, so the choice is meaningless.
  // Per the autoplan design adjudication: replace with an inline
  // "Invite someone to share" hint instead.
  const memberCount = useLiveQuery(
    async () => (await listUsersInHousehold(getDb(), householdId)).length,
    [householdId],
    1,
  );
  const isSoloHousehold = (memberCount ?? 1) <= 1;

  useEffect(() => {
    setError(null);
  }, [name, form, strengthValue, strengthUnit, doseUnit, vendor, notesMd, shareScope]);

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
      // Solo households save as 'private' (the toggle is hidden); the
      // server-side share-scope filter still works because the creator
      // is the only member who can see it.
      const effectiveShareScope: 'private' | 'household' = isSoloHousehold
        ? 'private'
        : shareScope;
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
            shareScope: effectiveShareScope,
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
            // creatorUserId stamped by the local repo from the active
            // user; the server re-stamps from the JWT principal on push
            // so a tampered client cannot claim ownership for someone
            // else (A0.2).
            creatorUserId: activeUserId,
            shareScope: effectiveShareScope,
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
      {isSoloHousehold ? (
        <p className="text-xs text-text-muted">
          You're the only member of this household — items default to private. Add a member
          to share inventory.
        </p>
      ) : (
        <fieldset className="block text-sm">
          <legend className="block font-medium">Visibility</legend>
          <div
            role="radiogroup"
            aria-label="Visibility"
            className="mt-1 inline-flex rounded-md border border-paper-300 bg-paper-50 p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={shareScope === 'private'}
              onClick={() => setShareScope('private')}
              className={
                shareScope === 'private'
                  ? 'flex items-center gap-1.5 rounded-sm bg-accent-primary px-3 py-1.5 text-xs text-white shadow-glow'
                  : 'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs text-text-secondary hover:bg-paper-200'
              }
            >
              <Lock className="h-3 w-3" aria-hidden /> Private
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={shareScope === 'household'}
              onClick={() => setShareScope('household')}
              className={
                shareScope === 'household'
                  ? 'flex items-center gap-1.5 rounded-sm bg-accent-primary px-3 py-1.5 text-xs text-white shadow-glow'
                  : 'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs text-text-secondary hover:bg-paper-200'
              }
            >
              <Users className="h-3 w-3" aria-hidden /> Share with household
            </button>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {shareScope === 'private'
              ? 'Only you can see, log doses against, or build protocols from this item.'
              : 'Everyone in the household can see and use this item.'}
          </p>
        </fieldset>
      )}
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
          className="rounded-md bg-accent-primary px-3 py-2 text-sm text-white hover:bg-accent-primary-hover shadow-glow disabled:opacity-50"
        >
          {initial ? 'Save changes' : 'Add product'}
        </button>
      </div>
    </form>
  );
}
