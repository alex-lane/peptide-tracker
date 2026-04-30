import type { PeptideDb } from '../db/schema.js';
import { drainOutbox, pendingCount, type DrainResult } from './drainer.js';
import { pullAndMerge, type PullResult } from './puller.js';
import { readConfig, type SyncConfig } from './config.js';
import { createTransport, type SyncTransport } from './transport.js';

export type SyncEvent =
  | { kind: 'pull'; at: string; result: PullResult }
  | { kind: 'push'; at: string; result: DrainResult }
  | { kind: 'error'; at: string; message: string };

export interface SyncStatus {
  online: boolean;
  configured: boolean;
  outboxDepth: number;
  lastPullAt: string | null;
  lastPushAt: string | null;
  recent: SyncEvent[];
}

export interface SyncEngineOptions {
  pullIntervalMs?: number;
}

/**
 * Wires drainer + puller behind a single SyncEngine. Triggers:
 *   - on construction (initial pull)
 *   - on online event
 *   - on visibility change (tab gains focus)
 *   - on a fixed interval (default 60s)
 *   - on outbox change (drain)
 *
 * Subscribers register a listener via `onChange()` to react to status updates.
 */
export class SyncEngine {
  private transport: SyncTransport;
  private cfg: SyncConfig = { workerUrl: '' };
  private listeners = new Set<(status: SyncStatus) => void>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private status: SyncStatus = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    configured: false,
    outboxDepth: 0,
    lastPullAt: null,
    lastPushAt: null,
    recent: [],
  };
  private inFlightPull: Promise<void> | null = null;
  private inFlightPush: Promise<void> | null = null;

  constructor(
    private readonly db: PeptideDb,
    private readonly options: SyncEngineOptions = {},
    fetcher: typeof fetch = typeof globalThis !== 'undefined'
      ? (globalThis.fetch as typeof fetch)
      : ((() => {
          throw new Error('fetch not available');
        }) as unknown as typeof fetch),
  ) {
    this.transport = createTransport(() => this.cfg, fetcher);
  }

  async start(): Promise<void> {
    this.cfg = await readConfig(this.db);
    this.status = { ...this.status, configured: this.cfg.workerUrl.length > 0 };
    await this.refreshOutboxDepth();
    this.notify();

    // Browser-only event wiring; gracefully no-op in tests.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      window.addEventListener('visibilitychange', this.handleVisibility);
    }
    const interval = this.options.pullIntervalMs ?? 60_000;
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, interval);

    // Watch outbox for new entries — drain when the depth changes.
    if (typeof this.db.outbox.hook === 'function') {
      try {
        this.db.outbox.hook('creating', () => {
          void this.refreshOutboxDepth().then(() => this.drain());
        });
      } catch {
        // Hook already attached or table not ready — fine.
      }
    }

    void this.tick();
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
      window.removeEventListener('visibilitychange', this.handleVisibility);
    }
  }

  /** Re-read config from the meta table (call after Settings updates). */
  async reloadConfig(): Promise<void> {
    this.cfg = await readConfig(this.db);
    this.status = { ...this.status, configured: this.cfg.workerUrl.length > 0 };
    this.notify();
  }

  /** Force a pull, ignoring the cursor. */
  async forcePull(): Promise<PullResult> {
    return this.runPull({ force: true });
  }

  /** Manually drain the outbox. */
  async drain(): Promise<DrainResult> {
    return this.runPush();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  onChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (!this.status.online) return;
    if (!this.cfg.workerUrl) return;
    await this.runPush();
    await this.runPull();
  }

  private async runPull(opts: { force?: boolean } = {}): Promise<PullResult> {
    if (!this.cfg.workerUrl) {
      const result: PullResult = { skipped: true, merged: {}, skippedRows: {}, cursor: null };
      return result;
    }
    if (this.inFlightPull) {
      await this.inFlightPull;
    }
    this.inFlightPull = (async () => {
      try {
        const result = await pullAndMerge(this.db, this.transport, opts);
        const at = new Date().toISOString();
        this.status = {
          ...this.status,
          lastPullAt: at,
          recent: this.appendEvent({ kind: 'pull', at, result }),
        };
        this.notify();
      } catch (err) {
        this.recordError(err);
      } finally {
        this.inFlightPull = null;
      }
    })();
    await this.inFlightPull;
    // Caller may want the result; re-read from status.recent for simplicity.
    const last = [...this.status.recent].reverse().find((e) => e.kind === 'pull');
    return last?.kind === 'pull'
      ? last.result
      : { skipped: true, merged: {}, skippedRows: {}, cursor: null };
  }

  private async runPush(): Promise<DrainResult> {
    if (!this.cfg.workerUrl) {
      return {
        attempted: 0,
        applied: 0,
        replayed: 0,
        conflicts: 0,
        rejected: 0,
        skipped: true,
        errors: [],
      };
    }
    if (this.inFlightPush) {
      await this.inFlightPush;
    }
    this.inFlightPush = (async () => {
      try {
        const result = await drainOutbox(this.db, this.transport);
        const at = new Date().toISOString();
        this.status = {
          ...this.status,
          lastPushAt: at,
          recent: this.appendEvent({ kind: 'push', at, result }),
        };
        await this.refreshOutboxDepth();
        this.notify();
      } catch (err) {
        this.recordError(err);
      } finally {
        this.inFlightPush = null;
      }
    })();
    await this.inFlightPush;
    const last = [...this.status.recent].reverse().find((e) => e.kind === 'push');
    return last?.kind === 'push'
      ? last.result
      : {
          attempted: 0,
          applied: 0,
          replayed: 0,
          conflicts: 0,
          rejected: 0,
          skipped: true,
          errors: [],
        };
  }

  private async refreshOutboxDepth(): Promise<void> {
    const depth = await pendingCount(this.db);
    this.status = { ...this.status, outboxDepth: depth };
  }

  private appendEvent(event: SyncEvent): SyncEvent[] {
    const next = [...this.status.recent, event];
    return next.slice(-20); // cap to last 20
  }

  private recordError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const at = new Date().toISOString();
    this.status = {
      ...this.status,
      recent: this.appendEvent({ kind: 'error', at, message }),
    };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.status);
  }

  private handleOnline = () => {
    this.status = { ...this.status, online: true };
    this.notify();
    void this.tick();
  };
  private handleOffline = () => {
    this.status = { ...this.status, online: false };
    this.notify();
  };
  private handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.tick();
    }
  };
}

let _engine: SyncEngine | null = null;

export function getEngine(db: PeptideDb): SyncEngine {
  if (!_engine) _engine = new SyncEngine(db);
  return _engine;
}

export function _resetEngineSingleton(): void {
  _engine?.stop();
  _engine = null;
}
