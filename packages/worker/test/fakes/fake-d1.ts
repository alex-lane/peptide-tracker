// In-memory D1 stub for unit tests. Implements the subset of SQL the
// sync routes generate: CREATE TABLE / CREATE INDEX (parsed but no-op),
// INSERT OR REPLACE, UPDATE … WHERE, SELECT … FROM … WHERE … ORDER BY …
// LIMIT, INSERT OR IGNORE, plus the columns/predicates the Worker uses.
//
// We hold rows in a Map per table. Queries accept ? placeholders, bound
// in order. ORDER BY accepts a single column ASC. WHERE supports equality,
// `>` for updated_at, and AND chains. This is sufficient for the routes;
// not a general-purpose SQLite emulator.
//
// The tests assert behavior of the Worker (auth, OCC, idempotency, FK
// ownership, server timestamps, cross-household isolation) — not SQL
// engine fidelity. A real D1 integration via Miniflare 3 / wrangler dev
// is exercised in the manual smoke at the end of M3.

import type { D1Database, D1PreparedStatement } from '../../src/db/d1.js';

interface Row extends Record<string, unknown> {}

interface ParsedSelect {
  kind: 'select';
  cols: string[];
  table: string;
  where: WhereClause[];
  orderBy?: { col: string };
  limit?: number;
}

interface ParsedInsert {
  kind: 'insert';
  table: string;
  cols: string[];
  orIgnore: boolean;
}

interface ParsedUpdate {
  kind: 'update';
  table: string;
  setCols: string[];
  where: WhereClause[];
}

type WhereClause =
  | { col: string; op: '=' | '>'; placeholder: true }
  | { col: string; op: 'IS NULL' };

interface DDL {
  kind: 'ddl';
}

type Parsed = ParsedSelect | ParsedInsert | ParsedUpdate | DDL;

function parse(sql: string): Parsed {
  const trimmed = sql.trim().replace(/\s+/g, ' ');
  const upper = trimmed.toUpperCase();

  if (
    upper.startsWith('CREATE TABLE') ||
    upper.startsWith('CREATE INDEX') ||
    upper.startsWith('CREATE UNIQUE INDEX')
  ) {
    return { kind: 'ddl' };
  }

  if (upper.startsWith('INSERT OR REPLACE INTO ') || upper.startsWith('INSERT OR IGNORE INTO ')) {
    const orIgnore = upper.startsWith('INSERT OR IGNORE INTO ');
    const m = trimmed.match(/INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) throw new Error(`fake-d1: cannot parse INSERT: ${sql}`);
    const table = m[1]!;
    const cols = m[2]!.split(',').map((c) => c.trim());
    return { kind: 'insert', table, cols, orIgnore };
  }

  if (upper.startsWith('UPDATE ')) {
    const tableMatch = trimmed.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (!tableMatch) throw new Error(`fake-d1: cannot parse UPDATE: ${sql}`);
    const table = tableMatch[1]!;
    const setExpr = tableMatch[2]!;
    const setCols = setExpr.split(',').map((part) => {
      const colMatch = part.match(/^\s*(\w+)\s*=\s*\?\s*$/);
      if (!colMatch) throw new Error(`fake-d1: cannot parse SET clause: ${part}`);
      return colMatch[1]!;
    });
    const where = parseWhere(tableMatch[3]!);
    return { kind: 'update', table, setCols, where };
  }

  if (upper.startsWith('SELECT ')) {
    const m = trimmed.match(
      /SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(\w+)\s+ASC)?(?:\s+LIMIT\s+(\d+))?$/i,
    );
    if (!m) throw new Error(`fake-d1: cannot parse SELECT: ${sql}`);
    const colExpr = m[1]!.trim();
    const table = m[2]!;
    const where = m[3] ? parseWhere(m[3]) : [];
    const cols =
      colExpr === '*' ? ['*'] : colExpr.split(',').map((c) => c.trim().replace(/\s+AS\s+\w+/i, ''));
    const out: ParsedSelect = { kind: 'select', cols, table, where };
    if (m[4]) out.orderBy = { col: m[4] };
    if (m[5]) out.limit = Number(m[5]);
    return out;
  }

  throw new Error(`fake-d1: unsupported SQL: ${sql}`);
}

function parseWhere(expr: string): WhereClause[] {
  return expr
    .split(/\s+AND\s+/i)
    .map((piece) => piece.trim())
    .filter((p) => p.length > 0)
    .map((piece) => {
      const eq = piece.match(/^(\w+)\s*=\s*\?$/);
      if (eq) return { col: eq[1]!, op: '=' as const, placeholder: true };
      const gt = piece.match(/^(\w+)\s*>\s*\?$/);
      if (gt) return { col: gt[1]!, op: '>' as const, placeholder: true };
      const isNull = piece.match(/^(\w+)\s+IS\s+NULL$/i);
      if (isNull) return { col: isNull[1]!, op: 'IS NULL' as const };
      throw new Error(`fake-d1: cannot parse WHERE piece: ${piece}`);
    });
}

export class FakeD1 implements D1Database {
  private readonly tables = new Map<string, Row[]>();

  /**
   * Convenience helper for tests: ensure a table exists. We could parse
   * the migration SQL but this is simpler and less brittle.
   */
  ensureTable(name: string): void {
    if (!this.tables.has(name)) this.tables.set(name, []);
  }

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this.tables, query);
  }

  async batch<T = unknown>(): Promise<Array<{ results: T[] }>> {
    throw new Error('fake-d1: batch() not implemented');
  }

  async exec(query: string): Promise<{ count: number }> {
    // Treat exec as best-effort DDL-only. Routes don't call this.
    const statements = query
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      const parsed = parse(stmt);
      if (parsed.kind !== 'ddl') {
        throw new Error('fake-d1: exec() only supports DDL');
      }
    }
    return { count: statements.length };
  }

  /** Direct row access for test seeds and assertions. */
  rowsOf(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  insertSeed(table: string, row: Row): void {
    this.ensureTable(table);
    this.tables.get(table)!.push({ ...row });
  }
}

class FakeStatement implements D1PreparedStatement {
  private bound: unknown[] = [];

  constructor(
    private readonly tables: Map<string, Row[]>,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bound = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const results = await this.runQuery();
    return (results[0] ?? null) as T | null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const results = await this.runQuery();
    return { results: results as T[] };
  }

  async run(): Promise<{ success: boolean }> {
    await this.runQuery();
    return { success: true };
  }

  private async runQuery(): Promise<Row[]> {
    const parsed = parse(this.query);
    if (parsed.kind === 'ddl') return [];
    if (parsed.kind === 'insert') {
      this.ensureTable(parsed.table);
      const rows = this.tables.get(parsed.table)!;
      const newRow: Row = {};
      parsed.cols.forEach((col, i) => {
        newRow[col] = this.bound[i] ?? null;
      });
      // INSERT OR REPLACE / IGNORE: locate by primary key. We model
      // primary keys per table — keep a static map.
      const pk = primaryKeyOf(parsed.table);
      const existingIdx = rows.findIndex((r) => keysMatch(r, newRow, pk));
      if (existingIdx >= 0) {
        if (!parsed.orIgnore) {
          rows[existingIdx] = newRow;
        }
        return [];
      }
      rows.push(newRow);
      return [];
    }
    if (parsed.kind === 'update') {
      this.ensureTable(parsed.table);
      const rows = this.tables.get(parsed.table)!;
      // bound ordering: setCols then where placeholders
      const setVals: Record<string, unknown> = {};
      parsed.setCols.forEach((col, i) => {
        setVals[col] = this.bound[i];
      });
      let cursor = parsed.setCols.length;
      const whereVals: Record<string, unknown> = {};
      for (const w of parsed.where) {
        if ('placeholder' in w && w.placeholder) {
          whereVals[w.col] = this.bound[cursor++];
        }
      }
      for (const row of rows) {
        if (!matchesWhere(row, parsed.where, whereVals)) continue;
        Object.assign(row, setVals);
      }
      return [];
    }
    // SELECT
    this.ensureTable(parsed.table);
    const rows = this.tables.get(parsed.table)!;
    const whereVals: Record<string, unknown> = {};
    let cursor = 0;
    for (const w of parsed.where) {
      if ('placeholder' in w && w.placeholder) {
        whereVals[w.col] = this.bound[cursor++];
      }
    }
    let filtered = rows.filter((r) => matchesWhere(r, parsed.where, whereVals));
    if (parsed.orderBy) {
      const col = parsed.orderBy.col;
      filtered = [...filtered].sort((a, b) => {
        const av = String(a[col] ?? '');
        const bv = String(b[col] ?? '');
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }
    if (parsed.limit !== undefined) filtered = filtered.slice(0, parsed.limit);

    if (parsed.cols.length === 1 && parsed.cols[0] === '1' && /\bAS\s+ok\b/i.test(this.query)) {
      // Special-case `SELECT 1 AS ok ...` — return ok=1 marker rows.
      return filtered.map(() => ({ ok: 1 }));
    }
    if (parsed.cols.length === 1 && parsed.cols[0] === '*') {
      return filtered.map((r) => ({ ...r }));
    }
    return filtered.map((r) => {
      const out: Row = {};
      for (const col of parsed.cols) out[col] = r[col] ?? null;
      return out;
    });
  }

  private ensureTable(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, []);
  }
}

function matchesWhere(row: Row, where: WhereClause[], vals: Record<string, unknown>): boolean {
  for (const w of where) {
    if (w.op === 'IS NULL') {
      if (row[w.col] !== null && row[w.col] !== undefined) return false;
      continue;
    }
    if (w.op === '=') {
      if (row[w.col] !== vals[w.col]) return false;
      continue;
    }
    if (w.op === '>') {
      const a = row[w.col];
      const b = vals[w.col];
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      if (!(a > b)) return false;
    }
  }
  return true;
}

function keysMatch(a: Row, b: Row, keys: string[]): boolean {
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

const PRIMARY_KEYS: Record<string, string[]> = {
  households: ['id'],
  user_profiles: ['id'],
  inventory_items: ['id'],
  inventory_batches: ['id'],
  supply_items: ['id'],
  protocols: ['id'],
  protocol_items: ['id'],
  dose_schedules: ['id'],
  dose_logs: ['id'],
  inventory_adjustments: ['id'],
  custom_metrics: ['id'],
  metric_logs: ['id'],
  calendar_feed_settings: ['id'],
  calendar_event_mappings: ['id'],
  calendar_export_history: ['id'],
  education_content: ['id'],
  processed_mutations: ['household_id', 'mutation_id'],
  access_users: ['email'],
};

function primaryKeyOf(table: string): string[] {
  return PRIMARY_KEYS[table] ?? ['id'];
}
