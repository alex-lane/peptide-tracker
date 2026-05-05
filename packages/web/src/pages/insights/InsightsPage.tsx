import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Plus, Trash2, TrendingUp, Target, TrendingDown, Activity, FileDown } from 'lucide-react';
import {
  filterByShareScope,
  getDb,
  type CustomMetric,
  type DoseLog,
  type DoseSchedule,
  type InventoryBatch,
  type InventoryItem,
  type MetricLog,
  type ProtocolItem,
} from '@/db';
import { useActive } from '@/app/useActive';
import { listUsersInHousehold } from '@/app/active-household';
import { computeAdherence, dailyAdherence } from './adherence';
import { computeBurndown } from './burndown';
import { archiveMetric, createMetric, logMetric, metricSeries } from './customMetrics';
import {
  buildUserDoseLogsCsv,
  buildUserJsonExport,
  buildUserMetricLogsCsv,
  downloadText,
} from './exportInsights';
import { LineChart } from './LineChart';
import { AdherenceRing } from './AdherenceRing';

export function InsightsPage() {
  const active = useActive();
  const db = getDb();

  const users = useLiveQuery(
    async () => (active.householdId ? await listUsersInHousehold(db, active.householdId) : []),
    [active.householdId],
    [],
  );
  const me = users?.find((u) => u.id === active.userId);

  const schedules = useLiveQuery(
    async () => {
      if (!active.householdId || !active.userId) return [];
      const all = await db.doseSchedules
        .where('householdId')
        .equals(active.householdId)
        .toArray();
      return all.filter((s) => !s.deletedAt && s.userId === active.userId);
    },
    [active.householdId, active.userId],
    [],
  );

  const doseLogs = useLiveQuery(
    async () => {
      if (!active.householdId || !active.userId) return [];
      const all = await db.doseLogs
        .where('[householdId+userId+takenAt]')
        .between(
          [active.householdId, active.userId, ''],
          [active.householdId, active.userId, '￿'],
          true,
          true,
        )
        .toArray();
      return all.filter((r) => !r.deletedAt);
    },
    [active.householdId, active.userId],
    [],
  );

  const inventoryBatches = useLiveQuery(
    async () =>
      active.householdId
        ? filterByShareScope(
            (
              await db.inventoryBatches.where('householdId').equals(active.householdId).toArray()
            ).filter((b) => !b.deletedAt),
            active.userId,
          )
        : [],
    [active.householdId, active.userId],
    [],
  );
  const inventoryItems = useLiveQuery(
    async () =>
      active.householdId
        ? filterByShareScope(
            (
              await db.inventoryItems.where('householdId').equals(active.householdId).toArray()
            ).filter((i) => !i.deletedAt),
            active.userId,
          )
        : [],
    [active.householdId, active.userId],
    [],
  );

  const protocolItems = useLiveQuery(async () => db.protocolItems.toArray(), [], []);

  const customMetrics = useLiveQuery(
    async () =>
      active.householdId && active.userId
        ? (
            await db.customMetrics
              .where('[householdId+userId]')
              .equals([active.householdId, active.userId])
              .toArray()
          ).filter((m) => !m.deletedAt)
        : [],
    [active.householdId, active.userId],
    [],
  );
  const metricLogs = useLiveQuery(
    async () =>
      active.householdId && active.userId
        ? ((await db.metricLogs
            .where('[householdId+userId+recordedAt]')
            .between(
              [active.householdId, active.userId, ''],
              [active.householdId, active.userId, '￿'],
              true,
              true,
            )
            .toArray()) as MetricLog[])
        : [],
    [active.householdId, active.userId],
    [],
  );

  if (active.loading) return <p className="text-sm text-ink-100">Loading…</p>;
  if (!active.ready || !me) {
    return <p className="text-sm text-ink-100">Set up your household first.</p>;
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/15 text-accent-cyan">
          <TrendingUp className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-xl">Insights</h1>
          <p className="text-xs text-text-secondary">
            Adherence, inventory burn-down, and your custom metrics. Tracking only.
          </p>
        </div>
      </header>

      <AdherenceCard schedules={schedules ?? []} logs={doseLogs ?? []} />

      <BurndownCard
        batches={inventoryBatches ?? []}
        items={inventoryItems ?? []}
        protocolItems={protocolItems ?? []}
        schedules={schedules ?? []}
      />

      <CustomMetricsCard
        householdId={active.householdId!}
        userId={active.userId!}
        metrics={customMetrics ?? []}
        logs={metricLogs ?? []}
      />

      <ExportCard
        householdId={active.householdId!}
        userId={active.userId!}
        userName={me.displayName}
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AdherenceCard({
  schedules,
  logs,
}: {
  schedules: DoseSchedule[];
  logs: DoseLog[];
}) {
  const now = new Date();
  const a30 = useMemo(
    () => computeAdherence({ schedules, logs, now, windowDays: 30 }),
    [schedules, logs],
  );
  const a90 = useMemo(
    () => computeAdherence({ schedules, logs, now, windowDays: 90 }),
    [schedules, logs],
  );
  const trend = useMemo(
    () => dailyAdherence({ schedules, logs, now, windowDays: 30 }),
    [schedules, logs],
  );
  const trendPoints = trend.map((d, i) => ({
    x: i,
    y: d.due === 0 ? 0 : d.logged / d.due,
    ...(i === 0 || i === trend.length - 1 ? { label: d.date.slice(5) } : {}),
  }));

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-base">
        <Target className="h-4 w-4 text-accent-primary" aria-hidden />
        Adherence
      </h2>
      <div className="flex items-center gap-4">
        <AdherenceRing rate={a30.rate} label="30 days" className="text-ink-300" />
        <AdherenceRing rate={a90.rate} label="90 days" className="text-ink-300" />
        <div className="text-xs text-ink-100">
          <p>
            Last 30 days: <span className="num">{a30.logged}</span> logged ·{' '}
            <span className="num">{a30.skipped}</span> skipped ·{' '}
            <span className="num">{a30.missed}</span> missed
          </p>
          <p className="mt-1">
            Last 90 days: <span className="num">{a90.due}</span> due
          </p>
          {a30.lowConfidence && a30.due > 0 && (
            <p className="mt-1 text-warn">Low sample size — interpret carefully.</p>
          )}
        </div>
      </div>
      {a30.due > 0 && (
        <div>
          <p className="text-xs text-ink-100">Daily adherence (30 days)</p>
          <LineChart
            points={trendPoints}
            yMin={0}
            yMax={1}
            yLabel="rate"
            className="text-ink-300"
            ariaLabel="Daily adherence rate over the last 30 days"
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BurndownCard({
  batches,
  items,
  protocolItems,
  schedules,
}: {
  batches: InventoryBatch[];
  items: InventoryItem[];
  protocolItems: ProtocolItem[];
  schedules: DoseSchedule[];
}) {
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));
  const batchesWithProjections = batches
    .map((b) => ({
      batch: b,
      result: computeBurndown({
        batch: b,
        schedules,
        protocolItems,
        siblingBatches: batches,
      }),
    }))
    .filter((x) => x.result.dosesApplied > 0);

  if (batchesWithProjections.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 space-y-2">
        <h2 className="flex items-center gap-2 text-base">
          <TrendingDown className="h-4 w-4 text-accent-pink" aria-hidden />
          Burn-down
        </h2>
        <p className="text-sm text-ink-100">
          No active batch + schedule pairs to project. Set a preferred batch on a protocol item to
          see depletion forecasts here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-base">
        <TrendingDown className="h-4 w-4 text-accent-pink" aria-hidden />
        Burn-down
      </h2>
      <ul className="space-y-3">
        {batchesWithProjections.map(({ batch, result }) => {
          const points = result.points.map((p, i, arr) => ({
            x: i,
            y: p.remaining,
            ...(i === 0 || i === arr.length - 1 ? { label: p.date.slice(5) } : {}),
          }));
          return (
            <li key={batch.id} className="space-y-1">
              <p className="text-sm">
                {itemNameById.get(batch.itemId) ?? '—'}{' '}
                <span className="text-xs text-ink-100">
                  · {batch.lotNumber ? `lot ${batch.lotNumber}` : 'no lot'} · {batch.initialQuantityUnit}
                </span>
              </p>
              <LineChart
                points={points}
                yMin={0}
                yMax={batch.initialQuantity}
                yLabel={batch.initialQuantityUnit}
                className="text-ink-300"
                ariaLabel={`Burn-down projection for ${itemNameById.get(batch.itemId) ?? 'batch'}`}
              />
              <p className="text-xs text-ink-100">
                {result.depletesOn ? (
                  <span className="text-warn">Projected depletion: {result.depletesOn}</span>
                ) : (
                  <>
                    {result.dosesApplied} dose{result.dosesApplied === 1 ? '' : 's'} projected ·
                    final remaining{' '}
                    <span className="num">
                      {result.points[result.points.length - 1]?.remaining.toFixed(2)}
                    </span>{' '}
                    {batch.initialQuantityUnit}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CustomMetricsCard({
  householdId,
  userId,
  metrics,
  logs,
}: {
  householdId: string;
  userId: string;
  metrics: CustomMetric[];
  logs: MetricLog[];
}) {
  const [adding, setAdding] = useState(false);
  const visible = metrics.filter((m) => !m.archived);
  return (
    <div className="rounded-md border border-paper-300 p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-accent-cyan" aria-hidden />
          Custom metrics
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-2 py-1 text-xs text-ink-200 hover:bg-paper-200 print:hidden"
        >
          <Plus className="h-3 w-3" /> New metric
        </button>
      </header>

      {visible.length === 0 ? (
        <p className="text-sm text-ink-100">
          No metrics yet. Define one (e.g. "Sleep score", "Energy /10") and log values over time.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <MetricRow
              key={m.id}
              metric={m}
              logs={logs.filter((l) => l.metricId === m.id)}
              householdId={householdId}
              userId={userId}
            />
          ))}
        </ul>
      )}

      {adding && (
        <NewMetricForm
          householdId={householdId}
          userId={userId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function MetricRow({
  metric,
  logs,
  householdId,
  userId,
}: {
  metric: CustomMetric;
  logs: MetricLog[];
  householdId: string;
  userId: string;
}) {
  const series = useMemo(() => metricSeries(metric, logs), [metric, logs]);
  const points = series.map((p, i, arr) => ({
    x: new Date(p.recordedAt).getTime(),
    y: p.value,
    ...(i === 0 || i === arr.length - 1 ? { label: p.recordedAt.slice(0, 10).slice(5) } : {}),
  }));
  const [valueRaw, setValueRaw] = useState('');
  const [busy, setBusy] = useState(false);

  async function record() {
    if (!valueRaw.trim()) return;
    setBusy(true);
    try {
      let value: number | boolean | string;
      if (metric.type === 'boolean') {
        value = valueRaw.trim().toLowerCase() === 'true' || valueRaw === '1';
      } else if (metric.type === 'text') {
        value = valueRaw;
      } else {
        const n = Number(valueRaw);
        if (!Number.isFinite(n)) return;
        // scale_1_10 is constrained to its declared range so the chart stays
        // honest. Out-of-range entries are clamped (not rejected) so the
        // user's intent — "high" / "low" — is preserved.
        value = metric.type === 'scale_1_10' ? Math.max(1, Math.min(10, n)) : n;
      }
      await logMetric(getDb(), { householdId, userId, metricId: metric.id, value });
      setValueRaw('');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm(`Archive "${metric.name}"? Existing log values are preserved.`)) return;
    await archiveMetric(getDb(), metric.id);
  }

  return (
    <li className="rounded-md border border-paper-300 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          {metric.name}
          {metric.unit && <span className="ml-1 text-xs text-ink-100">({metric.unit})</span>}
        </p>
        <button
          type="button"
          onClick={() => void archive()}
          aria-label="Archive metric"
          className="rounded-md p-1 text-ink-100 hover:bg-paper-200"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {points.length > 0 && metric.type !== 'text' && metric.type !== 'boolean' && (
        <LineChart
          points={points}
          {...(metric.type === 'scale_1_10' ? { yMin: 1, yMax: 10 } : {})}
          yLabel={metric.unit ?? 'value'}
          className="text-ink-300"
          ariaLabel={`${metric.name} over time`}
        />
      )}
      <div className="flex gap-2 text-sm print:hidden">
        <input
          type="text"
          inputMode={metric.type === 'text' ? 'text' : 'decimal'}
          value={valueRaw}
          onChange={(e) => setValueRaw(e.target.value)}
          placeholder={
            metric.type === 'boolean'
              ? 'true / false'
              : metric.type === 'scale_1_10'
                ? '1-10'
                : 'value'
          }
          className="flex-1 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void record()}
          disabled={busy || !valueRaw.trim()}
          className="rounded-md bg-accent-primary px-3 py-1 text-xs text-white shadow-glow disabled:opacity-50"
        >
          Record
        </button>
      </div>
      <p className="text-xs text-ink-100">
        {logs.length} entr{logs.length === 1 ? 'y' : 'ies'} recorded.
      </p>
    </li>
  );
}

function NewMetricForm({
  householdId,
  userId,
  onDone,
  onCancel,
}: {
  householdId: string;
  userId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [type, setType] = useState<CustomMetric['type']>('number');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error('Name required.');
      await createMetric(getDb(), {
        householdId,
        userId,
        name,
        ...(unit.trim() ? { unit } : {}),
        type,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-paper-300 p-3 space-y-2">
      <h3 className="text-sm font-medium">New metric</h3>
      <label className="block text-sm">
        <span className="block font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Sleep score"
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="block font-medium">Unit (optional)</span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            maxLength={20}
            placeholder="/10"
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomMetric['type'])}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-sm"
          >
            <option value="number">number</option>
            <option value="scale_1_10">scale 1-10</option>
            <option value="boolean">boolean</option>
            <option value="text">text</option>
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs text-ink-100 hover:bg-paper-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-accent-primary px-3 py-1 text-xs text-white shadow-glow disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ExportCard({
  householdId,
  userId,
  userName,
}: {
  householdId: string;
  userId: string;
  userName: string;
}) {
  const [busy, setBusy] = useState(false);
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = userName.toLowerCase().replace(/\s+/g, '-');

  async function dl(kind: 'doses-csv' | 'metrics-csv' | 'json') {
    setBusy(true);
    try {
      if (kind === 'doses-csv') {
        const csv = await buildUserDoseLogsCsv({ db: getDb(), householdId, userId });
        downloadText(`peptide-tracker-${slug}-doses-${stamp}.csv`, csv, 'text/csv');
      } else if (kind === 'metrics-csv') {
        const csv = await buildUserMetricLogsCsv({ db: getDb(), householdId, userId });
        downloadText(`peptide-tracker-${slug}-metrics-${stamp}.csv`, csv, 'text/csv');
      } else {
        const json = await buildUserJsonExport({ db: getDb(), householdId, userId });
        downloadText(
          `peptide-tracker-${slug}-${stamp}.export.v1.json`,
          JSON.stringify(json, null, 2),
          'application/json',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // Minimal print-friendly stylesheet via window.print on a print-only view.
  // Triggers the browser's native PDF export.
  function printPdf() {
    window.print();
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 space-y-2 print:hidden">
      <h2 className="flex items-center gap-2 text-base">
        <FileDown className="h-4 w-4 text-accent-primary" aria-hidden />
        Export
      </h2>
      <p className="text-sm text-ink-100">
        Per-user CSV / JSON / PDF for {userName}. PDF goes through the browser print dialog —
        choose "Save as PDF".
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void dl('doses-csv')}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Dose logs CSV
        </button>
        <button
          type="button"
          onClick={() => void dl('metrics-csv')}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Metric logs CSV
        </button>
        <button
          type="button"
          onClick={() => void dl('json')}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> JSON
        </button>
        <button
          type="button"
          onClick={printPdf}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200"
        >
          <Download className="h-3.5 w-3.5" /> Print as PDF
        </button>
      </div>
    </div>
  );
}
