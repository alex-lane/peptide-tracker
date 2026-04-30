import { useEffect, useRef, useState } from 'react';
import { exportToJson, getDb, importFromJson, type ImportMode } from '@/db';
import { getEngine, readConfig, writeConfig, type SyncConfig } from '@/sync';
import { useSyncStatus } from '@/sync/useSyncStatus';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'err'; label: string };

export function SettingsPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [mode, setMode] = useState<ImportMode>('merge_by_id_take_newer');
  const [counts, setCounts] = useState<{ logs: number; outbox: number } | null>(null);
  const [cfg, setCfg] = useState<SyncConfig>({ workerUrl: '' });
  const fileInput = useRef<HTMLInputElement>(null);
  const sync = useSyncStatus();

  useEffect(() => {
    void refreshCounts();
    void readConfig(getDb()).then(setCfg);
  }, []);

  async function refreshCounts() {
    const db = getDb();
    const logs = await db.doseLogs.count();
    const outbox = await db.outbox.count();
    setCounts({ logs, outbox });
  }

  async function saveSyncConfig() {
    setStatus({ kind: 'busy', label: 'Saving sync config…' });
    try {
      await writeConfig(getDb(), cfg);
      await getEngine(getDb()).reloadConfig();
      setStatus({ kind: 'ok', label: 'Sync config saved.' });
    } catch (err) {
      setStatus({ kind: 'err', label: errMsg(err) });
    }
  }

  async function handleForcePull() {
    setStatus({ kind: 'busy', label: 'Force-pulling from Worker…' });
    try {
      const result = await getEngine(getDb()).forcePull();
      if (result.skipped) {
        setStatus({ kind: 'err', label: 'Worker URL is not configured.' });
        return;
      }
      const total = Object.values(result.merged).reduce((a, b) => a + b, 0);
      setStatus({ kind: 'ok', label: `Pulled ${total} rows.` });
      await refreshCounts();
    } catch (err) {
      setStatus({ kind: 'err', label: errMsg(err) });
    }
  }

  async function handleDrain() {
    setStatus({ kind: 'busy', label: 'Draining outbox…' });
    try {
      const result = await getEngine(getDb()).drain();
      if (result.skipped) {
        setStatus({ kind: 'err', label: 'Worker URL is not configured.' });
        return;
      }
      setStatus({
        kind: 'ok',
        label: `Drained: ${result.applied} applied, ${result.replayed} replayed, ${result.conflicts} conflicts, ${result.rejected} rejected.`,
      });
      await refreshCounts();
    } catch (err) {
      setStatus({ kind: 'err', label: errMsg(err) });
    }
  }

  async function handleExport() {
    setStatus({ kind: 'busy', label: 'Building export…' });
    try {
      const json = await exportToJson(getDb());
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `peptide-tracker-${stamp}.export.v1.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: 'ok', label: 'Export downloaded.' });
    } catch (err) {
      setStatus({ kind: 'err', label: errMsg(err) });
    }
  }

  async function handleImport(file: File) {
    setStatus({ kind: 'busy', label: `Importing (mode: ${mode})…` });
    try {
      const text = await file.text();
      const result = await importFromJson(getDb(), text, mode);
      const total = Object.values(result.written).reduce((a, b) => a + b, 0);
      setStatus({ kind: 'ok', label: `Imported. ${total} rows written.` });
      await refreshCounts();
    } catch (err) {
      setStatus({ kind: 'err', label: errMsg(err) });
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl">Settings</h1>
        <p className="text-sm text-ink-100">
          Local data lives in your browser. Export periodically — recommended every 14 days.
        </p>
      </header>

      <div className="rounded-md border border-paper-300 p-4 space-y-3">
        <h2 className="text-base">Local database</h2>
        {counts ? (
          <p className="text-sm text-ink-100">
            <span className="num">{counts.logs}</span> dose logs ·{' '}
            <span className="num">{counts.outbox}</span> outbox entries pending sync
          </p>
        ) : (
          <p className="text-sm text-ink-100">Loading…</p>
        )}
      </div>

      <div className="rounded-md border border-paper-300 p-4 space-y-3">
        <h2 className="text-base">Sync</h2>
        <p className="text-sm text-ink-100">
          {sync.configured
            ? sync.online
              ? `Online · ${sync.outboxDepth} pending · last pulled ${formatRelative(sync.lastPullAt)}`
              : 'Offline — mutations queue locally and drain when reconnected.'
            : 'Worker URL is not set. Sync is disabled. JSON export/import remains available.'}
        </p>
        <label className="block text-sm">
          <span className="block font-medium">Worker URL</span>
          <input
            type="url"
            inputMode="url"
            placeholder="http://localhost:8787"
            value={cfg.workerUrl}
            onChange={(e) => setCfg({ ...cfg, workerUrl: e.target.value })}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-100">Dev overrides (optional)</summary>
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="block text-xs font-medium">x-dev-as email</span>
              <input
                type="email"
                value={cfg.devAs ?? ''}
                onChange={(e) => setCfg({ ...cfg, devAs: e.target.value })}
                className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-xs"
                placeholder="alex@household.local"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium">x-dev-household UUID</span>
              <input
                type="text"
                value={cfg.devHousehold ?? ''}
                onChange={(e) => setCfg({ ...cfg, devHousehold: e.target.value })}
                className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-xs"
                placeholder="00000000-0000-..."
              />
            </label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={saveSyncConfig}
            className="rounded-md bg-ink-300 px-3 py-2 text-sm text-paper-100 transition-colors duration-120 hover:bg-ink-200"
          >
            Save config
          </button>
          <button
            type="button"
            onClick={handleForcePull}
            disabled={!sync.configured}
            className="rounded-md border border-paper-300 px-3 py-2 text-sm text-ink-200 transition-colors duration-120 hover:bg-paper-200 disabled:opacity-50"
          >
            Force pull
          </button>
          <button
            type="button"
            onClick={handleDrain}
            disabled={!sync.configured || sync.outboxDepth === 0}
            className="rounded-md border border-paper-300 px-3 py-2 text-sm text-ink-200 transition-colors duration-120 hover:bg-paper-200 disabled:opacity-50"
          >
            Drain outbox
          </button>
        </div>
        {sync.recent.length > 0 && (
          <div className="pt-2">
            <h3 className="text-xs font-medium text-ink-100">Recent sync events</h3>
            <ul className="mt-1 space-y-1 font-mono text-xs">
              {sync.recent
                .slice()
                .reverse()
                .slice(0, 8)
                .map((event, i) => (
                  <li key={`${event.at}-${i}`} className="text-ink-100">
                    {summarizeEvent(event)}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-md border border-paper-300 p-4 space-y-3">
        <h2 className="text-base">Export</h2>
        <p className="text-sm text-ink-100">
          Saves a SHA-256-verified JSON file containing every household, user, item, batch,
          schedule, log, adjustment, and education entry on this device.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="touch-lg rounded-md bg-ink-300 px-4 py-2 text-paper-100 transition-colors duration-120 hover:bg-ink-200 disabled:opacity-50"
          disabled={status.kind === 'busy'}
        >
          Export to JSON
        </button>
      </div>

      <div className="rounded-md border border-paper-300 p-4 space-y-3">
        <h2 className="text-base">Import</h2>
        <p className="text-sm text-ink-100">
          Restore from a previous export. Hash is verified before any write.
        </p>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Conflict mode</legend>
          {(['merge_by_id_take_newer', 'merge_by_id', 'replace'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span>
                <span className="font-mono text-xs">{m}</span>
                <span className="text-ink-100"> — {modeBlurb(m)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="block text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            e.target.value = '';
          }}
        />
      </div>

      <div aria-live="polite" className="text-sm">
        {status.kind === 'busy' && <p className="text-ink-100">{status.label}</p>}
        {status.kind === 'ok' && <p className="text-success">{status.label}</p>}
        {status.kind === 'err' && <p className="text-danger">{status.label}</p>}
      </div>
    </section>
  );
}

function modeBlurb(m: ImportMode): string {
  switch (m) {
    case 'replace':
      return 'Wipe local data, then load the file as the only source.';
    case 'merge_by_id':
      return 'Overwrite local rows with file rows on id conflict.';
    case 'merge_by_id_take_newer':
      return 'Keep whichever copy has the newer updatedAt (recommended).';
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function summarizeEvent(e: import('@/sync').SyncEvent): string {
  const t = e.at.slice(11, 19);
  if (e.kind === 'pull') {
    const total = Object.values(e.result.merged).reduce((a, b) => a + b, 0);
    return `${t}  pull  ${total} merged`;
  }
  if (e.kind === 'push') {
    return `${t}  push  ${e.result.applied} applied  ${e.result.replayed} replayed  ${e.result.conflicts} conflicts  ${e.result.rejected} rejected`;
  }
  return `${t}  err   ${e.message}`;
}
