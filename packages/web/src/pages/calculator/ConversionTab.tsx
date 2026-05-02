import { useMemo, useState } from 'react';
import {
  ML_PER_INSULIN_UNIT_U100,
  MathError,
  insulinUnit,
  mL,
  insulinUnitsU100ToMl,
  mlToInsulinUnitsU100,
  parseDecimalInput,
} from '@peptide/domain';
import { SyringeVisualization } from './SyringeVisualization';

type Mode = 'mass' | 'volume';

export function ConversionTab() {
  const [mode, setMode] = useState<Mode>('mass');
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="block text-sm font-medium">Convert</legend>
        <div className="mt-2 flex gap-1">
          <ToggleButton active={mode === 'mass'} onClick={() => setMode('mass')}>
            Mass (mcg / mg / g)
          </ToggleButton>
          <ToggleButton active={mode === 'volume'} onClick={() => setMode('volume')}>
            Volume (mL ↔ U-100 units)
          </ToggleButton>
        </div>
      </fieldset>
      {mode === 'mass' ? <MassConverter /> : <VolumeConverter />}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full bg-accent-primary px-3 py-1.5 text-xs text-white shadow-glow'
          : 'rounded-full bg-paper-200 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-300'
      }
    >
      {children}
    </button>
  );
}

function MassConverter() {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'mcg' | 'mg' | 'g'>('mg');

  const parsed = useMemo<
    { ok: true; mcg: number; mg: number; g: number } | { ok: false; error: string } | null
  >(() => {
    if (!value.trim()) return null;
    try {
      const n = parseDecimalInput(value);
      const mcgValue = unit === 'mcg' ? n : unit === 'mg' ? n * 1000 : n * 1_000_000;
      return {
        ok: true,
        mcg: mcgValue,
        mg: mcgValue / 1000,
        g: mcgValue / 1_000_000,
      };
    } catch (err) {
      if (err instanceof MathError) return { ok: false, error: err.message };
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [value, unit]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Amount</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="5"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'mcg' | 'mg' | 'g')}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="mcg">mcg</option>
            <option value="mg">mg</option>
            <option value="g">g</option>
          </select>
        </label>
      </div>
      {parsed && parsed.ok ? (
        <div className="grid grid-cols-3 gap-2">
          <ConversionChip
            label="mcg"
            value={parsed.mcg.toLocaleString()}
            highlighted={unit === 'mcg'}
          />
          <ConversionChip label="mg" value={formatNum(parsed.mg)} highlighted={unit === 'mg'} />
          <ConversionChip label="g" value={formatNum(parsed.g)} highlighted={unit === 'g'} />
        </div>
      ) : parsed && !parsed.ok ? (
        <p className="text-sm text-warn">{parsed.error}</p>
      ) : (
        <p className="text-sm text-ink-100">Enter an amount to see conversions.</p>
      )}
      <ConstantsPanel />
    </>
  );
}

function VolumeConverter() {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'mL' | 'units'>('mL');
  const [capacityUnits, setCapacityUnits] = useState<30 | 50 | 100>(100);

  const parsed = useMemo<
    { ok: true; ml: number; units: number } | { ok: false; error: string } | null
  >(() => {
    if (!value.trim()) return null;
    try {
      const n = parseDecimalInput(value);
      if (unit === 'mL') {
        const u = mlToInsulinUnitsU100(mL(n));
        return { ok: true, ml: n, units: u as unknown as number };
      }
      const m = insulinUnitsU100ToMl(insulinUnit(n));
      return { ok: true, ml: m as unknown as number, units: n };
    } catch (err) {
      if (err instanceof MathError) return { ok: false, error: err.message };
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [value, unit]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Amount</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
            placeholder="0.1"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'mL' | 'units')}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="mL">mL</option>
            <option value="units">U-100 units</option>
          </select>
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="block font-medium">Show on syringe</legend>
        <div className="mt-2 flex gap-1">
          {([30, 50, 100] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCapacityUnits(s)}
              aria-pressed={capacityUnits === s}
              className={
                capacityUnits === s
                  ? 'rounded-full bg-accent-primary px-3 py-1.5 text-xs text-white shadow-glow'
                  : 'rounded-full bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:bg-border-subtle'
              }
            >
              {s}u ({(s * 0.01).toFixed(1)} mL)
            </button>
          ))}
        </div>
      </fieldset>
      {parsed && parsed.ok ? (
        <div className="grid grid-cols-2 gap-2">
          <ConversionChip label="mL" value={formatNum(parsed.ml)} highlighted={unit === 'mL'} />
          <ConversionChip
            label="U-100 units"
            value={formatNum(parsed.units)}
            highlighted={unit === 'units'}
          />
        </div>
      ) : parsed && !parsed.ok ? (
        <p className="text-sm text-warn">{parsed.error}</p>
      ) : (
        <p className="text-sm text-text-secondary">Enter an amount to see conversions.</p>
      )}
      {/* Always show the syringe so the user can preview a draw without typing. */}
      <SyringeVisualization
        capacityUnits={capacityUnits}
        fillUnits={parsed && parsed.ok ? parsed.units : 0}
      />
      <p className="text-xs text-text-muted">
        Constant: 1 U-100 unit = <span className="num">{ML_PER_INSULIN_UNIT_U100}</span> mL. U-40
        and U-500 syringes use different concentration calibrations and aren't converted here.
      </p>
    </>
  );
}

function ConversionChip({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        highlighted
          ? 'rounded-md border border-ink-300 bg-paper-50 px-3 py-2'
          : 'rounded-md border border-paper-300 bg-paper-50 px-3 py-2'
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-100">{label}</p>
      <p className="num mt-1 text-base">{value}</p>
    </div>
  );
}

function ConstantsPanel() {
  return (
    <p className="text-xs text-ink-100">
      Mass canonicalizes to mcg internally:{' '}
      <span className="num">1 g = 1,000 mg = 1,000,000 mcg</span>. IU↔mass conversions are
      product-specific and intentionally NOT auto-applied.
    </p>
  );
}

function formatNum(n: number): string {
  if (n === 0) return '0';
  // Use up to 6 significant decimals for small values; trim trailing zeros.
  if (Math.abs(n) >= 1) return Number(n.toFixed(4)).toString();
  return Number(n.toFixed(6)).toString();
}
