// Bidirectional row codec — converts between the shape the Worker takes
// in / sends out (JSON, camelCase, native types) and the shape SQLite
// stores (snake_case columns, JSON-as-TEXT, booleans-as-INTEGER).

import type { TableSpec } from './tables.js';

/**
 * Encode a domain row → ordered column-value tuple in the spec's column
 * order. Suitable for INSERT/UPDATE binding.
 */
export function encodeRow(
  spec: TableSpec,
  row: Record<string, unknown>,
): {
  columns: string[];
  values: unknown[];
} {
  const columns: string[] = [];
  const values: unknown[] = [];

  for (const [field, sqlCol] of Object.entries(spec.columns)) {
    columns.push(sqlCol);
    const raw = row[field];
    values.push(encodeField(spec, field, raw));
  }
  return { columns, values };
}

export function encodeField(spec: TableSpec, field: string, raw: unknown): unknown {
  if (raw === undefined) return null;
  if (raw === null) return null;
  if (spec.jsonFields.has(field)) return JSON.stringify(raw);
  if (spec.boolFields.has(field)) return raw ? 1 : 0;
  return raw;
}

/**
 * Decode a SQLite row record (key = sql column) → domain JSON shape.
 */
export function decodeRow<T = Record<string, unknown>>(
  spec: TableSpec,
  sqlRow: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = {};

  // Build an inverse map (sql_col → field) once per call. Cheap.
  const inverse: Record<string, string> = {};
  for (const [field, sqlCol] of Object.entries(spec.columns)) inverse[sqlCol] = field;

  for (const [sqlCol, value] of Object.entries(sqlRow)) {
    const field = inverse[sqlCol];
    if (!field) continue; // ignore extra columns
    if (value === null || value === undefined) {
      // Skip — undefined reads as "field absent" on the JSON side.
      continue;
    }
    if (spec.jsonFields.has(field)) {
      out[field] = JSON.parse(String(value));
    } else if (spec.boolFields.has(field)) {
      out[field] = Boolean(value);
    } else {
      out[field] = value;
    }
  }
  return out as T;
}
