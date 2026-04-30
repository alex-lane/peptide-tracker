// Minimal D1 surface used by the routes. We don't depend on Drizzle's
// query builder at runtime — Drizzle's schema/types remain the source
// of truth (see schema.ts) but the actual SQL goes through this thin
// row-shape wrapper so we can guarantee the household_id-injection
// invariant statically.

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results: T[] }>>;
  exec(query: string): Promise<{ count: number }>;
}
