import { useEffect, useRef, useState } from 'react';
import { exportToJson, getDb, importFromJson, type ImportMode } from '@/db';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; label: string }
  | { kind: 'err'; label: string };

export function SettingsPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [mode, setMode] = useState<ImportMode>('merge_by_id_take_newer');
  const [counts, setCounts] = useState<{ logs: number; outbox: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshCounts();
  }, []);

  async function refreshCounts() {
    const db = getDb();
    const logs = await db.doseLogs.count();
    const outbox = await db.outbox.count();
    setCounts({ logs, outbox });
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
        <h2 className="text-base">Export</h2>
        <p className="text-sm text-ink-100">
          Saves a SHA-256-verified JSON file containing every household, user, item, batch,
          schedule, log, adjustment, and education entry on this device.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="px-4 py-2 bg-ink-300 text-paper-100 rounded-md transition-colors duration-120 ease-out-fast hover:bg-ink-200 disabled:opacity-50"
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
