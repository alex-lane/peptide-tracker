import { useMemo, useState } from 'react';
import {
  reconstitute,
  parseDecimalInput,
  type ReconstitutionResult,
  MathError,
} from '@peptide/domain';
import { getDb, InventoryBatchRepo, nowIso } from '@/db';
import type { InventoryBatch, InventoryItem } from '@/db';
import { assertTransition } from './status-machine';

interface Props {
  item: InventoryItem;
  batch: InventoryBatch;
  activeUserId: string;
  onSaved: (batch: InventoryBatch) => void;
  onCancel: () => void;
}

/**
 * Calls reconstitute() from @peptide/domain, displays the formula trace
 * (the calculator's "show your work" panel), and on confirm writes a
 * ReconstitutionRecord onto the batch + flips status sealed → reconstituted.
 *
 * Pre-fills the vial mass from item.defaultStrength + batch.initialQuantity
 * when both look like a mass. The user can override.
 */
export function ReconstituteForm({ item, batch, activeUserId, onSaved, onCancel }: Props) {
  const presetMass = useMemo(() => {
    if (item.defaultStrength) {
      return {
        value: String(item.defaultStrength.value),
        unit: item.defaultStrength.unit as 'mcg' | 'mg' | 'g' | 'IU',
      };
    }
    if (
      batch.initialQuantity > 0 &&
      (batch.initialQuantityUnit === 'mg' ||
        batch.initialQuantityUnit === 'mcg' ||
        batch.initialQuantityUnit === 'g')
    ) {
      return {
        value: String(batch.initialQuantity),
        unit: batch.initialQuantityUnit,
      };
    }
    return { value: '', unit: 'mg' as const };
  }, [item, batch]);

  const [vialMass, setVialMass] = useState(presetMass.value);
  const [vialUnit, setVialUnit] = useState<'mcg' | 'mg' | 'g' | 'IU'>(presetMass.unit);
  const [diluentMl, setDiluentMl] = useState('2');
  const [diluentType, setDiluentType] = useState<'bac_water' | 'sterile_water' | 'other'>(
    'bac_water',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result: { ok: true; data: ReconstitutionResult } | { ok: false; error: string } | null =
    useMemo(() => {
      if (!vialMass.trim() || !diluentMl.trim()) return null;
      try {
        const mass = parseDecimalInput(vialMass);
        const vol = parseDecimalInput(diluentMl);
        if (vialUnit === 'IU') {
          return {
            ok: false,
            error:
              'IU vials require an explicit IU-to-mass spec; not supported in v1 reconstitution.',
          };
        }
        const out = reconstitute({
          vialMass: mass,
          vialMassUnit: vialUnit,
          diluentVolumeMl: vol,
          diluentType,
        });
        return { ok: true, data: out };
      } catch (err) {
        if (err instanceof MathError) return { ok: false, error: err.message };
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }, [vialMass, vialUnit, diluentMl, diluentType]);

  async function handleConfirm() {
    if (!result || !result.ok) return;
    setBusy(true);
    setError(null);
    try {
      assertTransition(batch.status, 'reconstituted');
      const repo = new InventoryBatchRepo(getDb());
      const concentration = result.data.concentrationMcgPerMl as number;
      const next: InventoryBatch = {
        ...batch,
        status: 'reconstituted',
        // Treat the diluent volume as the new "remaining" so dose math against
        // mL ↔ insulin units lines up. The unit flips to mL.
        initialQuantity: parseDecimalInput(diluentMl),
        initialQuantityUnit: 'mL',
        remainingQuantity: parseDecimalInput(diluentMl),
        reconstitution: {
          reconstitutedAt: nowIso(),
          diluentVolumeMl: parseDecimalInput(diluentMl),
          diluentType,
          resultingConcentration: {
            value: concentration / 1000,
            unit: 'mg',
            perMl: true,
          },
          byUserId: activeUserId,
        },
        updatedAt: nowIso(),
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
    <div className="space-y-4">
      <header>
        <h3 className="text-base">Reconstitute {item.name}</h3>
        <p className="text-xs text-ink-100">
          Adds bacteriostatic / sterile water to a lyophilized vial. Saves the resulting
          concentration onto the batch.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Vial mass</span>
          <input
            inputMode="decimal"
            value={vialMass}
            onChange={(e) => setVialMass(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm touch-lg"
            placeholder="5"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Mass unit</span>
          <select
            value={vialUnit}
            onChange={(e) => setVialUnit(e.target.value as typeof vialUnit)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm touch-lg"
          >
            <option value="mcg">mcg</option>
            <option value="mg">mg</option>
            <option value="g">g</option>
            <option value="IU">IU (unsupported)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Diluent (mL)</span>
          <input
            inputMode="decimal"
            value={diluentMl}
            onChange={(e) => setDiluentMl(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm touch-lg"
            placeholder="2"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Type</span>
          <select
            value={diluentType}
            onChange={(e) => setDiluentType(e.target.value as typeof diluentType)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="bac_water">BAC water</option>
            <option value="sterile_water">Sterile water</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <section
        aria-label="Show your work"
        className="rounded-md border border-paper-300 bg-paper-50 p-3 text-sm"
      >
        <h4 className="text-xs font-medium uppercase tracking-wide text-ink-100">Show your work</h4>
        {result && result.ok ? (
          <div className="mt-1 space-y-1">
            <p className="font-mono text-sm">{result.data.formula}</p>
            <p className="text-xs text-ink-100">
              Concentration:{' '}
              <span className="num">{result.data.concentrationMgPerMlDisplay} mg/mL</span> ·{' '}
              <span className="num">
                {(result.data.concentrationMcgPerMl as number).toLocaleString()} mcg/mL
              </span>
            </p>
          </div>
        ) : result && !result.ok ? (
          <p className="mt-1 text-xs text-warn">{result.error}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-100">Enter a vial mass and diluent volume.</p>
        )}
      </section>

      <p className="text-xs text-ink-100">
        Tracking and calculation only — not medical advice. Verify the math before drawing.
      </p>
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
          type="button"
          disabled={!result?.ok || busy}
          onClick={handleConfirm}
          className="rounded-md bg-accent-primary px-3 py-2 text-sm text-white hover:bg-accent-primary-hover shadow-glow disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm reconstitution'}
        </button>
      </div>
    </div>
  );
}
