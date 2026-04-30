import type { PeptideDb } from '@/db';
import { nowIso } from '@/db';

const KEY_PREFIX = 'calc.preset.v1.';

export interface CalculatorPreset {
  itemId: string;
  /** Reconstitution side */
  vialMass: string;
  vialMassUnit: 'mcg' | 'mg' | 'g' | 'IU';
  diluentMl: string;
  diluentType: 'bac_water' | 'sterile_water' | 'other';
  /** Dose side */
  lastDoseAmount: string;
  lastDoseUnit: 'mcg' | 'mg' | 'g' | 'IU';
  syringeScale: 'U-100' | 'U-40' | 'U-500';
  /** Capsule / drop helpers (less common; kept for future). */
  perUnitStrength?: string;
  perUnitStrengthUnit?: 'mcg' | 'mg' | 'g' | 'IU';
  savedAt: string;
}

function keyFor(itemId: string): string {
  return `${KEY_PREFIX}${itemId}`;
}

export async function readPreset(db: PeptideDb, itemId: string): Promise<CalculatorPreset | null> {
  const row = await db.meta.get(keyFor(itemId));
  if (!row) return null;
  const value = row.value as Partial<CalculatorPreset> | undefined;
  if (!value || value.itemId !== itemId) return null;
  return value as CalculatorPreset;
}

export async function writePreset(db: PeptideDb, preset: CalculatorPreset): Promise<void> {
  await db.meta.put({
    key: keyFor(preset.itemId),
    value: { ...preset, savedAt: nowIso() },
    updatedAt: nowIso(),
  });
}

export async function deletePreset(db: PeptideDb, itemId: string): Promise<void> {
  await db.meta.delete(keyFor(itemId));
}
