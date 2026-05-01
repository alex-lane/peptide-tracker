import { useEffect, useMemo, useState } from 'react';
import { MathError, parseDecimalInput, reconstitute } from '@peptide/domain';
import { getDb } from '@/db';
import type { InventoryItem } from '@/db';
import { ResultTile, ShowYourWork } from './Result';
import { readPreset, writePreset } from './presets';
import { SyringeVisualization } from './SyringeVisualization';

interface Props {
  items: InventoryItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
}

export function ReconstituteTab({ items, selectedItemId, onSelectItem }: Props) {
  const [vialMass, setVialMass] = useState('');
  const [vialUnit, setVialUnit] = useState<'mcg' | 'mg' | 'g' | 'IU'>('mg');
  const [diluentMl, setDiluentMl] = useState('2');
  const [diluentType, setDiluentType] = useState<'bac_water' | 'sterile_water' | 'other'>(
    'bac_water',
  );
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Pre-fill from preset OR from item.defaultStrength when an item is selected.
  useEffect(() => {
    if (!selectedItemId) {
      setSavedAt(null);
      return;
    }
    const item = items.find((i) => i.id === selectedItemId);
    if (!item) return;
    void (async () => {
      const preset = await readPreset(getDb(), selectedItemId);
      if (preset) {
        setVialMass(preset.vialMass);
        setVialUnit(preset.vialMassUnit);
        setDiluentMl(preset.diluentMl);
        setDiluentType(preset.diluentType);
        setSavedAt(preset.savedAt);
      } else if (item.defaultStrength) {
        setVialMass(String(item.defaultStrength.value));
        setVialUnit(item.defaultStrength.unit);
        setDiluentMl('2');
        setDiluentType('bac_water');
        setSavedAt(null);
      }
    })();
  }, [selectedItemId, items]);

  const result = useMemo(() => {
    if (!vialMass.trim() || !diluentMl.trim()) return null;
    if (vialUnit === 'IU') {
      return {
        ok: false as const,
        error: 'IU vials require a product-specific IU↔mass conversion (not supported in v1).',
      };
    }
    try {
      const mass = parseDecimalInput(vialMass);
      const vol = parseDecimalInput(diluentMl);
      const out = reconstitute({
        vialMass: mass,
        vialMassUnit: vialUnit,
        diluentVolumeMl: vol,
        diluentType,
      });
      return { ok: true as const, data: out };
    } catch (err) {
      if (err instanceof MathError) return { ok: false as const, error: err.message };
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [vialMass, vialUnit, diluentMl, diluentType]);

  async function savePreset() {
    if (!selectedItemId) return;
    await writePreset(getDb(), {
      itemId: selectedItemId,
      vialMass,
      vialMassUnit: vialUnit,
      diluentMl,
      diluentType,
      lastDoseAmount: '',
      lastDoseUnit: 'mcg',
      syringeCapacityUnits: 100,
      savedAt: new Date().toISOString(),
    });
    setSavedAt(new Date().toISOString());
  }

  const concMcgPerMl = result?.ok ? (result.data.concentrationMcgPerMl as number) : null;
  const concMgPerMl = result?.ok ? result.data.concentrationMgPerMlDisplay : null;

  return (
    <div className="space-y-4">
      <ProductPicker items={items} value={selectedItemId} onChange={onSelectItem} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Vial mass</span>
          <input
            inputMode="decimal"
            value={vialMass}
            onChange={(e) => setVialMass(e.target.value)}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="5"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Mass unit</span>
          <select
            value={vialUnit}
            onChange={(e) => setVialUnit(e.target.value as typeof vialUnit)}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
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
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
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

      {result?.ok && concMcgPerMl !== null && concMgPerMl !== null ? (
        <ResultTile
          primary={concMgPerMl}
          primaryUnit="mg/mL"
          secondary={concMcgPerMl.toLocaleString()}
          secondaryUnit="mcg/mL"
        />
      ) : (
        <ResultTile
          primary={'—'}
          primaryUnit="mg/mL"
          hint={result && !result.ok ? result.error : 'Enter a vial mass and diluent volume.'}
        />
      )}

      {/* Show a 100u reference syringe with the diluent volume marked, so
          the user gets a visual feel for how much they're injecting. */}
      <SyringeVisualization
        capacityUnits={100}
        fillUnits={result?.ok && parseFloat(diluentMl) ? Math.min(100, parseFloat(diluentMl) * 100) : 0}
      />

      <ShowYourWork
        {...(result?.ok ? { formula: result.data.formula } : {})}
        {...(result && !result.ok ? { error: result.error } : {})}
      />

      {selectedItemId && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-ink-100">
            {savedAt
              ? `Preset saved ${formatRelative(savedAt)}.`
              : 'No preset saved for this product.'}
          </span>
          <button
            type="button"
            onClick={() => void savePreset()}
            disabled={!result?.ok}
            className="rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
          >
            Save as preset
          </button>
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
        <option value="">— No product selected —</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-ink-100">
        Picking a product loads its default strength + any saved preset.
      </span>
    </label>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
