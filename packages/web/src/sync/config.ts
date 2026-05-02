import type { PeptideDb } from '../db/schema.js';

const KEY_CONFIG = 'sync.config.v1';
const KEY_CURSOR = 'sync.cursor.v1';

export interface SyncConfig {
  /** Worker base URL (no trailing slash). Empty string disables sync entirely. */
  workerUrl: string;
  /** Optional dev-as override (mirrors the Worker x-dev-as header). */
  devAs?: string;
  /** Optional dev household override (mirrors x-dev-household). */
  devHousehold?: string;
  /** Engine-injected fallbacks pulled from the active household/user
   *  on every tick. NOT persisted — these populate the dev headers
   *  whenever the user hasn't typed an explicit override into Settings. */
  activeUserEmail?: string;
  activeHouseholdId?: string;
}

const DEFAULT_CONFIG: SyncConfig = { workerUrl: '' };

export async function readConfig(db: PeptideDb): Promise<SyncConfig> {
  const row = await db.meta.get(KEY_CONFIG);
  if (!row) return { ...DEFAULT_CONFIG };
  const value = row.value as Partial<SyncConfig> | undefined;
  return { ...DEFAULT_CONFIG, ...(value ?? {}) };
}

export async function writeConfig(db: PeptideDb, cfg: SyncConfig): Promise<void> {
  await db.meta.put({ key: KEY_CONFIG, value: cfg, updatedAt: new Date().toISOString() });
}

export async function readCursor(db: PeptideDb): Promise<string | null> {
  const row = await db.meta.get(KEY_CURSOR);
  if (!row) return null;
  return typeof row.value === 'string' ? row.value : null;
}

export async function writeCursor(db: PeptideDb, cursor: string): Promise<void> {
  await db.meta.put({ key: KEY_CURSOR, value: cursor, updatedAt: new Date().toISOString() });
}

export async function clearCursor(db: PeptideDb): Promise<void> {
  await db.meta.delete(KEY_CURSOR);
}
