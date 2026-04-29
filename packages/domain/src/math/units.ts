// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

import { MathError } from './errors.js';
import { assertPositiveFinite } from './round.js';

// ─── Branded primitive types ──────────────────────────────────────────
//
// Branded numbers prevent accidentally adding mcg to mg or mL to insulin
// units. Every calculator only accepts branded inputs; conversion is
// explicit at construction time.

declare const __unitBrand: unique symbol;
type Brand<TName extends string> = { readonly [__unitBrand]: TName };

export type Mcg = number & Brand<'mcg'>;
export type Mg = number & Brand<'mg'>;
export type G = number & Brand<'g'>;
export type IU = number & Brand<'iu'>;
export type Ml = number & Brand<'ml'>;
/** Insulin syringe units on a U-100 syringe (1 unit = 0.01 mL). */
export type InsulinUnit = number & Brand<'insulin-u100'>;
export type Capsules = number & Brand<'capsules'>;
export type Tablets = number & Brand<'tablets'>;
export type Drops = number & Brand<'drops'>;
export type Sprays = number & Brand<'sprays'>;

// Concentration is mass per volume. We canonicalize as mcg/mL internally.
export type McgPerMl = number & Brand<'mcg/ml'>;

// ─── Constructors (assert finite-positive at the boundary) ────────────

export const mcg = (n: number): Mcg => assertPositiveFinite(n, 'mcg') as Mcg;
export const mg = (n: number): Mg => assertPositiveFinite(n, 'mg') as Mg;
export const g = (n: number): G => assertPositiveFinite(n, 'g') as G;
export const iu = (n: number): IU => assertPositiveFinite(n, 'IU') as IU;
export const mL = (n: number): Ml => assertPositiveFinite(n, 'mL') as Ml;
export const insulinUnit = (n: number): InsulinUnit =>
  assertPositiveFinite(n, 'insulin units (U-100)') as InsulinUnit;
export const capsules = (n: number): Capsules => assertPositiveFinite(n, 'capsules') as Capsules;
export const tablets = (n: number): Tablets => assertPositiveFinite(n, 'tablets') as Tablets;
export const drops = (n: number): Drops => assertPositiveFinite(n, 'drops') as Drops;
export const sprays = (n: number): Sprays => assertPositiveFinite(n, 'sprays') as Sprays;
export const mcgPerMl = (n: number): McgPerMl => assertPositiveFinite(n, 'mcg/mL') as McgPerMl;

// ─── Mass conversion (canonical = mcg) ────────────────────────────────
//
// IU is product-specific and intentionally NOT auto-convertible to mass.
// Each IU calculator accepts both axes explicitly with a warning surfaced.

export function gToMcg(value: G): Mcg {
  return ((value as number) * 1_000_000) as Mcg;
}
export function mgToMcg(value: Mg): Mcg {
  return ((value as number) * 1000) as Mcg;
}
export function mcgToMg(value: Mcg): Mg {
  return ((value as number) / 1000) as Mg;
}
export function mcgToG(value: Mcg): G {
  return ((value as number) / 1_000_000) as G;
}

// ─── Volume conversion ────────────────────────────────────────────────

/**
 * U-100 syringe: 1 unit = 0.01 mL. The ONLY supported insulin scale by
 * default; U-40 and U-500 require an explicit warning at the call site.
 */
export const ML_PER_INSULIN_UNIT_U100 = 0.01;

export function mlToInsulinUnitsU100(volume: Ml): InsulinUnit {
  return ((volume as number) / ML_PER_INSULIN_UNIT_U100) as InsulinUnit;
}

export function insulinUnitsU100ToMl(units: InsulinUnit): Ml {
  return ((units as number) * ML_PER_INSULIN_UNIT_U100) as Ml;
}

// ─── Concentration ────────────────────────────────────────────────────

/**
 * Convert dose mass (mcg) and concentration (mcg/mL) to volume (mL).
 * Refuses zero / negative concentration with a structured error.
 */
export function massToVolume(dose: Mcg, concentration: McgPerMl): Ml {
  const c = concentration as number;
  if (c <= 0) {
    throw new MathError(
      'CONCENTRATION_REQUIRED',
      'Concentration must be > 0 mcg/mL to convert dose to volume',
      { concentration: c },
    );
  }
  return ((dose as number) / c) as Ml;
}

/**
 * Inverse: given volume drawn and concentration, what mass was delivered?
 * Useful for "show your work" panels.
 */
export function volumeToMass(volume: Ml, concentration: McgPerMl): Mcg {
  return ((volume as number) * (concentration as number)) as Mcg;
}

// ─── Generic mass-axis conversion (for UI dose-unit toggles) ──────────

export type MassUnit = 'mcg' | 'mg' | 'g';

export function massInUnit(amountMcg: Mcg, unit: MassUnit): number {
  switch (unit) {
    case 'mcg':
      return amountMcg as number;
    case 'mg':
      return mcgToMg(amountMcg) as number;
    case 'g':
      return mcgToG(amountMcg) as number;
  }
}

export function massFromUnit(amount: number, unit: MassUnit): Mcg {
  switch (unit) {
    case 'mcg':
      return mcg(amount);
    case 'mg':
      return mgToMcg(mg(amount));
    case 'g':
      return gToMcg(g(amount));
  }
}
