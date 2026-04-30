import { useEffect, useMemo, useState } from 'react';
import {
  computeDoseVolume,
  MathError,
  mcgPerMl,
  parseDecimalInput,
  reconstitute,
} from '@peptide/domain';
import { getDb } from '@/db';
import type { InventoryBatch, InventoryItem } from '@/db';
import { ResultTile, ShowYourWork } from './Result';
import { readPreset, writePreset } from './presets';

interface InferredConcentration {
  mcgPerMl: number;
  sourceLabel: string;
}

interface Props {
  items: InventoryItem[];
  batches: InventoryBatch[];
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
}

const KEY_DOSE_MAX = 'calc.dose.max.v1.';

export function DoseTab({ items, batches, selectedItemId, onSelectItem }: Props) {
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnit, setDoseUnit] = useState<'mcg' | 'mg' | 'g' | 'IU'>('mcg');
  const [syringeScale, setSyringeScale] = useState<'U-100' | 'U-40' | 'U-500'>('U-100');

  // Manual concentration is a fallback when there's no product OR the
  // selected product has no reconstituted batch and no saved preset.
  const [manualConcentration, setManualConcentration] = useState('');
  const [manualConcUnit, setManualConcUnit] = useState<'mg' | 'mcg'>('mg');

  // Bumped on Record-max so the previous-max useMemo re-reads localStorage.
  const [maxRecordTick, setMaxRecordTick] = useState(0);

  // Inferred concentration for the currently-selected product. We try in
  // priority order:
  //   1. Most-recent reconstituted batch (`batch.reconstitution.resultingConcentration`)
  //   2. Saved preset on the calculator (vialMass + diluentMl + diluentType)
  // If neither exists, manual mode renders instead.
  const [inferred, setInferred] = useState<InferredConcentration | null>(null);

  // Recompute inferred concentration whenever the product or its batches change.
  useEffect(() => {
    if (!selectedItemId) {
      setInferred(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      // Try a real reconstituted batch first.
      const batchCandidates = batches
        .filter((b) => b.itemId === selectedItemId && !b.deletedAt && b.reconstitution)
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
      const bestBatch = batchCandidates[0];
      if (bestBatch?.reconstitution) {
        const c = bestBatch.reconstitution.resultingConcentration;
        if (c.unit === 'IU') {
          // IU↔mass is product-specific and intentionally not auto-converted.
          if (!cancelled) setInferred(null);
          return;
        }
        const mcgPerMlValue =
          c.unit === 'mg' ? c.value * 1000 : c.unit === 'g' ? c.value * 1_000_000 : c.value;
        if (!cancelled) {
          setInferred({
            mcgPerMl: mcgPerMlValue,
            sourceLabel: `${c.value} ${c.unit}/mL — from reconstituted batch`,
          });
        }
        return;
      }
      // Fall back to a saved Reconstitute-tab preset.
      const preset = await readPreset(getDb(), selectedItemId);
      if (!preset || !preset.vialMass.trim() || !preset.diluentMl.trim()) {
        if (!cancelled) setInferred(null);
        return;
      }
      if (preset.vialMassUnit === 'IU') {
        // IU↔mass is product-specific and intentionally not auto-converted.
        if (!cancelled) setInferred(null);
        return;
      }
      try {
        const out = reconstitute({
          vialMass: parseDecimalInput(preset.vialMass),
          vialMassUnit: preset.vialMassUnit,
          diluentVolumeMl: parseDecimalInput(preset.diluentMl),
          diluentType: preset.diluentType,
        });
        if (!cancelled) {
          setInferred({
            mcgPerMl: out.concentrationMcgPerMl as unknown as number,
            sourceLabel: `${out.concentrationMgPerMlDisplay} mg/mL — from saved preset`,
          });
        }
      } catch {
        if (!cancelled) setInferred(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedItemId, batches]);

  // Pre-fill the dose amount/unit/syringe scale from preset on item change.
  useEffect(() => {
    if (!selectedItemId) return;
    const item = items.find((i) => i.id === selectedItemId);
    if (!item) return;
    void (async () => {
      const preset = await readPreset(getDb(), selectedItemId);
      if (preset) {
        setDoseAmount(preset.lastDoseAmount);
        setDoseUnit(preset.lastDoseUnit);
        setSyringeScale(preset.syringeScale);
      } else if (
        item.defaultUnitOfDose &&
        (item.defaultUnitOfDose === 'mcg' ||
          item.defaultUnitOfDose === 'mg' ||
          item.defaultUnitOfDose === 'g' ||
          item.defaultUnitOfDose === 'IU')
      ) {
        setDoseUnit(item.defaultUnitOfDose);
      }
    })();
  }, [selectedItemId, items]);

  const concentrationMcgPerMl = useMemo<number | null>(() => {
    if (inferred) return inferred.mcgPerMl;
    if (selectedItemId) return null; // a product is picked but has no inference yet
    if (!manualConcentration.trim()) return null;
    try {
      const n = parseDecimalInput(manualConcentration);
      return manualConcUnit === 'mg' ? n * 1000 : n;
    } catch {
      return null;
    }
  }, [inferred, manualConcentration, manualConcUnit, selectedItemId]);

  const result = useMemo(() => {
    if (!doseAmount.trim()) return null;
    if (concentrationMcgPerMl === null || concentrationMcgPerMl <= 0) return null;
    if (doseUnit === 'IU') {
      return {
        ok: false as const,
        error: 'IU dosing requires a product-specific IU↔mass conversion (not supported in v1).',
      };
    }
    try {
      const amount = parseDecimalInput(doseAmount);
      const out = computeDoseVolume({
        doseAmount: amount,
        doseUnit,
        concentrationMcgPerMl: mcgPerMl(concentrationMcgPerMl),
        syringeScale,
      });
      return { ok: true as const, data: out };
    } catch (err) {
      if (err instanceof MathError) return { ok: false as const, error: err.message };
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [doseAmount, doseUnit, concentrationMcgPerMl, syringeScale]);

  // "result > 2× previous max" surface from PLAN §7.8.
  const previousMaxMcg = useMemo(() => {
    if (!selectedItemId) return null;
    try {
      const raw = localStorage.getItem(KEY_DOSE_MAX + selectedItemId);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, [selectedItemId, maxRecordTick]);

  const sanityWarning = useMemo(() => {
    if (!result?.ok || !selectedItemId || previousMaxMcg === null) return null;
    if (result.data.doseMcg > previousMaxMcg * 2) {
      return `Dose is more than 2× the largest previous dose for this product (${previousMaxMcg} mcg). Double-check the unit.`;
    }
    return null;
  }, [result, previousMaxMcg, selectedItemId]);

  function recordMaxIfApplicable() {
    if (!result?.ok || !selectedItemId) return;
    const prev = previousMaxMcg ?? 0;
    if (result.data.doseMcg > prev) {
      try {
        localStorage.setItem(KEY_DOSE_MAX + selectedItemId, String(result.data.doseMcg));
        setMaxRecordTick((t) => t + 1);
      } catch {
        // ignore
      }
    }
  }

  async function savePreset() {
    if (!selectedItemId) return;
    const existing = await readPreset(getDb(), selectedItemId);
    await writePreset(getDb(), {
      itemId: selectedItemId,
      vialMass: existing?.vialMass ?? '',
      vialMassUnit: existing?.vialMassUnit ?? 'mg',
      diluentMl: existing?.diluentMl ?? '2',
      diluentType: existing?.diluentType ?? 'bac_water',
      lastDoseAmount: doseAmount,
      lastDoseUnit: doseUnit,
      syringeScale,
      savedAt: new Date().toISOString(),
    });
  }

  const allWarnings: Array<{ code: string; message: string }> = [];
  if (result?.ok) {
    allWarnings.push(...result.data.warnings);
    if (sanityWarning) {
      allWarnings.push({ code: 'DOSE_GT_2X_PREV_MAX', message: sanityWarning });
    }
  }

  return (
    <div className="space-y-4">
      <ProductPicker items={items} value={selectedItemId} onChange={onSelectItem} />

      <ConcentrationSource
        productSelected={selectedItemId !== null}
        inferred={inferred}
        manualValue={manualConcentration}
        manualUnit={manualConcUnit}
        onManualValueChange={setManualConcentration}
        onManualUnitChange={setManualConcUnit}
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Dose amount</span>
          <input
            inputMode="decimal"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="250"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Unit</span>
          <select
            value={doseUnit}
            onChange={(e) => setDoseUnit(e.target.value as typeof doseUnit)}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="mcg">mcg</option>
            <option value="mg">mg</option>
            <option value="g">g</option>
            <option value="IU">IU (unsupported)</option>
          </select>
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="block font-medium">Syringe scale</legend>
        <div className="mt-2 flex gap-1">
          {(['U-100', 'U-40', 'U-500'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSyringeScale(s)}
              aria-pressed={syringeScale === s}
              className={
                syringeScale === s
                  ? 'rounded-full bg-ink-300 px-3 py-1.5 text-xs text-paper-100'
                  : 'rounded-full bg-paper-200 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-300'
              }
            >
              {s}
            </button>
          ))}
        </div>
        <span className="mt-1 block text-xs text-ink-100">
          Insulin-syringe scale on the syringe you're drawing with. U-100 is by far the most common
          for peptide use; non-U-100 surfaces a warning.
        </span>
      </fieldset>

      {result?.ok ? (
        <ResultTile
          primary={result.data.volumeMlDisplay}
          primaryUnit="mL"
          secondary={result.data.insulinUnitsU100Display}
          secondaryUnit="units (U-100)"
        />
      ) : (
        <ResultTile
          primary={'—'}
          primaryUnit="mL"
          hint={
            result && !result.ok
              ? result.error
              : concentrationMcgPerMl === null
                ? 'Enter a concentration (or pick a product whose batch has been reconstituted).'
                : 'Enter a dose amount.'
          }
        />
      )}

      <ShowYourWork
        {...(result?.ok ? { formula: result.data.formula } : {})}
        {...(result && !result.ok ? { error: result.error } : {})}
        {...(allWarnings.length > 0 ? { warnings: allWarnings } : {})}
      />

      {selectedItemId && result?.ok && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-ink-100">
            {previousMaxMcg !== null
              ? `Previous max for this product: ${previousMaxMcg.toLocaleString()} mcg.`
              : 'No previous doses recorded for this product.'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={recordMaxIfApplicable}
              className="rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200"
            >
              Record max
            </button>
            <button
              type="button"
              onClick={() => void savePreset()}
              className="rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200"
            >
              Save as preset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductPicker({
  items,
  value,
  onChange,
}: {
  items: InventoryItem[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="block font-medium">Product (optional)</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
      >
        <option value="">— Manual concentration —</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConcentrationSource({
  productSelected,
  inferred,
  manualValue,
  manualUnit,
  onManualValueChange,
  onManualUnitChange,
}: {
  productSelected: boolean;
  inferred: InferredConcentration | null;
  manualValue: string;
  manualUnit: 'mg' | 'mcg';
  onManualValueChange: (v: string) => void;
  onManualUnitChange: (u: 'mg' | 'mcg') => void;
}) {
  if (inferred) {
    return (
      <div className="rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-100">Concentration</p>
        <p className="mt-1">
          <span className="num">{inferred.mcgPerMl.toLocaleString()}</span>
          <span className="ml-1 text-ink-100">mcg/mL</span>
          <span className="ml-2 text-xs text-ink-100">— {inferred.sourceLabel}</span>
        </p>
      </div>
    );
  }
  if (productSelected) {
    return (
      <div className="rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-100">Concentration</p>
        <p className="mt-1 text-warn">
          No reconstitution data for this product yet. Reconstitute a batch from Inventory or
          save a preset on the Reconstitute tab to enable concentration inference.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">
        <span className="block font-medium">Concentration</span>
        <input
          inputMode="decimal"
          value={manualValue}
          onChange={(e) => onManualValueChange(e.target.value)}
          className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
          placeholder="2.5"
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium">Per mL</span>
        <select
          value={manualUnit}
          onChange={(e) => onManualUnitChange(e.target.value as 'mg' | 'mcg')}
          className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        >
          <option value="mg">mg/mL</option>
          <option value="mcg">mcg/mL</option>
        </select>
      </label>
    </div>
  );
}
