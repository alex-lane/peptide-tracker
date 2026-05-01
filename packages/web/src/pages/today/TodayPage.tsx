import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import {
  DoseLogRepo,
  getDb,
  newId,
  nowIso,
  type DoseLog,
  type DoseSchedule,
  type InventoryBatch,
  type InventoryItem,
  type Protocol,
  type ProtocolItem,
} from '@/db';
import { HouseholdBootstrap } from '@/app/HouseholdBootstrap';
import { useActive } from '@/app/useActive';
import { listUsersInHousehold } from '@/app/active-household';
import { Pill } from '@/components/ui';
import { LogDoseModal } from './LogDoseModal';
import { rolloverMissedSchedules } from './missedRollover';
import { computeInventoryWarnings } from './inventoryWarnings';
import { Sparkline } from './Sparkline';

export function TodayPage() {
  const active = useActive();
  const db = getDb();

  // Auto-rollover missed schedules whenever the page mounts and the active
  // household is known. Best-effort; failures are non-fatal.
  useEffect(() => {
    if (!active.householdId) return;
    void rolloverMissedSchedules(db, active.householdId).catch(() => {});
  }, [active.householdId, db]);

  const users = useLiveQuery(
    async () => (active.householdId ? await listUsersInHousehold(db, active.householdId) : []),
    [active.householdId],
    [],
  );
  const me = users?.find((u) => u.id === active.userId);

  const inventoryItems = useLiveQuery(
    async () =>
      active.householdId
        ? (await db.inventoryItems.where('householdId').equals(active.householdId).toArray()).filter(
            (i) => !i.deletedAt,
          )
        : [],
    [active.householdId],
    [],
  );
  const inventoryBatches = useLiveQuery(
    async () =>
      active.householdId
        ? (
            await db.inventoryBatches.where('householdId').equals(active.householdId).toArray()
          ).filter((b) => !b.deletedAt)
        : [],
    [active.householdId],
    [],
  );
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
  const protocols = useLiveQuery(
    async () => {
      if (!active.householdId || !active.userId) return [];
      const all = await db.protocols.where('householdId').equals(active.householdId).toArray();
      return all.filter((p) => !p.deletedAt && p.userId === active.userId);
    },
    [active.householdId, active.userId],
    [],
  );
  const protocolItems = useLiveQuery(
    async () => db.protocolItems.toArray(),
    [],
    [],
  );
  const recentLogs = useLiveQuery(
    async () => {
      if (!active.householdId || !active.userId) return [];
      const rows = await db.doseLogs
        .where('[householdId+userId+takenAt]')
        .between(
          [active.householdId, active.userId, ''],
          [active.householdId, active.userId, '￿'],
          true,
          true,
        )
        .toArray();
      return rows
        .filter((r) => !r.deletedAt)
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
        .slice(0, 5);
    },
    [active.householdId, active.userId],
    [],
  );

  const [manualLogOpen, setManualLogOpen] = useState(false);
  const [scheduleToLog, setScheduleToLog] = useState<DoseSchedule | null>(null);

  if (active.loading) {
    return <div className="text-sm text-ink-100">Loading…</div>;
  }
  if (!active.ready || !me) {
    return (
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl">Welcome</h1>
          <p className="text-sm text-ink-100">
            Set up your household to start tracking. This stays local until you configure sync.
          </p>
        </header>
        <HouseholdBootstrap />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl">{me.displayName}'s day</h1>
          <p className="text-sm text-ink-100">Pending doses, warnings, and recent activity.</p>
        </div>
        <button
          type="button"
          onClick={() => setManualLogOpen(true)}
          className="flex items-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm text-white shadow-glow transition-colors hover:bg-accent-primary-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} /> Log dose
        </button>
      </header>

      <PendingDosesCard
        schedules={schedules ?? []}
        inventoryItems={inventoryItems ?? []}
        onTap={(s) => setScheduleToLog(s)}
      />

      <InventoryWarningsCard
        batches={inventoryBatches ?? []}
        schedules={schedules ?? []}
        inventoryItems={inventoryItems ?? []}
      />

      <BurnDownCard
        protocols={protocols ?? []}
        protocolItems={protocolItems ?? []}
        schedules={schedules ?? []}
        inventoryItems={inventoryItems ?? []}
      />

      <RecentActivityCard logs={recentLogs ?? []} inventoryItems={inventoryItems ?? []} />

      <ActiveProtocolsCard protocols={protocols ?? []} />

      {manualLogOpen && (
        <LogDoseModal
          open={manualLogOpen}
          onOpenChange={setManualLogOpen}
          user={me}
          inventoryItems={inventoryItems ?? []}
          inventoryBatches={inventoryBatches ?? []}
          mode={{ kind: 'manual' }}
        />
      )}
      {scheduleToLog && (
        <LogDoseModal
          open={scheduleToLog !== null}
          onOpenChange={(o) => !o && setScheduleToLog(null)}
          user={me}
          inventoryItems={inventoryItems ?? []}
          inventoryBatches={inventoryBatches ?? []}
          mode={{
            kind: 'from_schedule',
            schedule: scheduleToLog,
            ...(((protocolItems ?? []).find((pi) => pi.id === scheduleToLog.protocolItemId)
              ? {
                  protocolItem: (protocolItems ?? []).find(
                    (pi) => pi.id === scheduleToLog.protocolItemId,
                  ),
                }
              : {}) as { protocolItem?: ProtocolItem }),
          }}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PendingDosesCard({
  schedules,
  inventoryItems,
  onTap,
}: {
  schedules: DoseSchedule[];
  inventoryItems: InventoryItem[];
  onTap: (s: DoseSchedule) => void;
}) {
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  const buckets = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now.getTime());
    todayEnd.setHours(23, 59, 59, 999);
    const upcomingEnd = new Date(now.getTime() + 24 * 3600_000);
    const missed: DoseSchedule[] = [];
    const today: DoseSchedule[] = [];
    const upcoming: DoseSchedule[] = [];
    for (const s of schedules) {
      if (s.status === 'missed') {
        missed.push(s);
      } else if (s.status === 'pending') {
        const t = new Date(s.scheduledFor).getTime();
        if (t <= todayEnd.getTime()) today.push(s);
        else if (t <= upcomingEnd.getTime()) upcoming.push(s);
      }
    }
    const sortBy = (a: DoseSchedule, b: DoseSchedule) =>
      a.scheduledFor.localeCompare(b.scheduledFor);
    return {
      missed: missed.sort(sortBy),
      today: today.sort(sortBy),
      upcoming: upcoming.sort(sortBy),
    };
  }, [schedules]);

  const total = buckets.missed.length + buckets.today.length + buckets.upcoming.length;

  return (
    <div className="rounded-md border border-paper-300 p-4">
      <h2 className="mb-2 text-base">Pending doses</h2>
      {total === 0 ? (
        <p className="text-sm text-ink-100">
          Nothing scheduled. Add a protocol or use "Log dose" to record an ad-hoc dose.
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {buckets.missed.length > 0 && (
            <Bucket
              label="Missed"
              variant="missed"
              schedules={buckets.missed}
              itemNameById={itemNameById}
              onTap={onTap}
            />
          )}
          {buckets.today.length > 0 && (
            <Bucket
              label="Today"
              variant="today"
              schedules={buckets.today}
              itemNameById={itemNameById}
              onTap={onTap}
            />
          )}
          {buckets.upcoming.length > 0 && (
            <Bucket
              label="Upcoming (24h)"
              variant="upcoming"
              schedules={buckets.upcoming}
              itemNameById={itemNameById}
              onTap={onTap}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Bucket({
  label,
  variant,
  schedules,
  itemNameById,
  onTap,
}: {
  label: string;
  variant: 'missed' | 'today' | 'upcoming';
  schedules: DoseSchedule[];
  itemNameById: Map<string, string>;
  onTap: (s: DoseSchedule) => void;
}) {
  const tone = variant === 'missed' ? 'danger' : variant === 'today' ? 'primary' : 'cyan';
  return (
    <div>
      <div className="mb-2">
        <Pill tone={tone} dot>
          {label} · {schedules.length}
        </Pill>
      </div>
      <ul className="ruled-y rounded-md border border-paper-300">
        {schedules.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p>{itemNameById.get(s.itemId) ?? '—'}</p>
              <p className="text-xs text-ink-100">
                <span className="num">{s.doseAmount}</span> {s.doseUnit} ·{' '}
                {s.method.toUpperCase()} · {formatScheduledFor(s.scheduledFor)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTap(s)}
              className={
                variant === 'missed'
                  ? 'rounded-md bg-warn px-3 py-1.5 text-xs text-warn-fg hover:opacity-90'
                  : 'rounded-md bg-ink-300 px-3 py-1.5 text-xs text-paper-100 hover:bg-ink-200'
              }
            >
              {variant === 'missed' ? 'Log late' : 'Log'}
            </button>
            <button
              type="button"
              onClick={() => void skipSchedule(s)}
              className="rounded-md border border-paper-300 px-2 py-1 text-xs text-ink-200 hover:bg-paper-200"
            >
              Skip
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function skipSchedule(s: DoseSchedule) {
  const db = getDb();
  await db.transaction('rw', db.doseSchedules, db.outbox, async () => {
    const fresh = await db.doseSchedules.get(s.id);
    if (!fresh || fresh.deletedAt) return;
    const next = {
      ...fresh,
      status: 'skipped' as const,
      updatedAt: nowIso(),
      version: fresh.version + 1,
    };
    await db.doseSchedules.put(next);
    await db.outbox.add({
      mutationId: newId(),
      entity: 'doseSchedule',
      op: 'upsert',
      payload: next,
      createdAt: nowIso(),
      retryCount: 0,
      lastError: null,
      ackedAt: null,
    });
  });
}

function formatScheduledFor(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function InventoryWarningsCard({
  batches,
  schedules,
  inventoryItems,
}: {
  batches: InventoryBatch[];
  schedules: DoseSchedule[];
  inventoryItems: InventoryItem[];
}) {
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  const warnings = useMemo(
    () => computeInventoryWarnings({ batches, schedules }),
    [batches, schedules],
  );
  return (
    <div className="rounded-md border border-paper-300 p-4">
      <h2 className="mb-2 text-base">Inventory warnings</h2>
      {warnings.length === 0 ? (
        <p className="text-sm text-ink-100">No warnings — inventory looks clear.</p>
      ) : (
        <ul className="ruled-y rounded-md border border-paper-300 text-sm">
          {warnings.map((w) => (
            <li key={`${w.batchId}-${w.kind}`} className="flex items-center gap-2 px-3 py-2">
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[11px] ${
                  w.kind === 'discard_by_passed'
                    ? 'bg-danger text-paper-100'
                    : 'bg-warn text-warn-fg'
                }`}
              >
                {w.kind === 'discard_by_passed'
                  ? 'discard'
                  : w.kind === 'expiring_soon'
                    ? 'expiring'
                    : 'low'}
              </span>
              <span className="flex-1">{itemNameById.get(w.itemId) ?? '—'}</span>
              <span className="text-xs text-ink-100">{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BurnDownCard({
  protocols,
  protocolItems,
  schedules,
  inventoryItems,
}: {
  protocols: Protocol[];
  protocolItems: ProtocolItem[];
  schedules: DoseSchedule[];
  inventoryItems: InventoryItem[];
}) {
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  const activeProtocols = protocols.filter((p) => p.active);
  if (activeProtocols.length === 0) return null;

  const series = activeProtocols.flatMap((p) => {
    const items = protocolItems.filter((pi) => pi.protocolId === p.id);
    return items.map((pi) => ({
      protocolName: p.name,
      itemId: pi.itemId,
      counts: countByDay(
        schedules.filter((s) => s.protocolItemId === pi.id && s.status === 'pending'),
        14,
      ),
    }));
  });

  const nonEmpty = series.filter((s) => s.counts.some((c) => c > 0));
  if (nonEmpty.length === 0) return null;

  return (
    <div className="rounded-md border border-paper-300 p-4">
      <h2 className="mb-2 text-base">Upcoming load (14 days)</h2>
      <ul className="ruled-y rounded-md border border-paper-300 text-sm">
        {nonEmpty.map((s, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1 truncate">
              {itemNameById.get(s.itemId) ?? '—'}{' '}
              <span className="text-xs text-ink-100">· {s.protocolName}</span>
            </span>
            <Sparkline values={s.counts} className="text-ink-200" />
            <span className="num text-xs text-ink-100">
              {s.counts.reduce((acc, n) => acc + n, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function countByDay(schedules: DoseSchedule[], days: number): number[] {
  const out = Array(days).fill(0) as number[];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of schedules) {
    const t = new Date(s.scheduledFor);
    const local = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    const dayOffset = Math.floor(
      (local.getTime() - today.getTime()) / (24 * 3600_000),
    );
    if (dayOffset >= 0 && dayOffset < days) {
      out[dayOffset] = (out[dayOffset] ?? 0) + 1;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

function RecentActivityCard({
  logs,
  inventoryItems,
}: {
  logs: DoseLog[];
  inventoryItems: InventoryItem[];
}) {
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  return (
    <div className="rounded-md border border-paper-300 p-4">
      <h2 className="mb-2 text-base">Recent activity</h2>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-100">No dose logs yet.</p>
      ) : (
        <ul className="ruled-y rounded-md border border-paper-300 text-sm">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p>{itemNameById.get(l.itemId) ?? '—'}</p>
                <p className="text-xs text-ink-100">
                  <span className="num">{l.doseAmount}</span> {l.doseUnit} ·{' '}
                  {l.method.toUpperCase()} · {new Date(l.takenAt).toLocaleString()}
                </p>
              </div>
              <DeleteLogButton logId={l.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteLogButton({ logId }: { logId: string }) {
  const [busy, setBusy] = useState(false);
  async function onDelete() {
    if (!window.confirm('Delete this dose log? Inventory will be credited back.')) return;
    setBusy(true);
    try {
      const repo = new DoseLogRepo(getDb());
      await repo.undo(logId);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void onDelete()}
      disabled={busy}
      aria-label="Delete dose log"
      className="rounded-md p-1 text-ink-100 hover:bg-paper-200 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ActiveProtocolsCard({ protocols }: { protocols: Protocol[] }) {
  const active = protocols.filter((p) => p.active);
  if (active.length === 0) return null;
  return (
    <div className="rounded-md border border-paper-300 p-4">
      <h2 className="mb-2 text-base">Active protocols</h2>
      <ul className="flex flex-wrap gap-2 text-xs">
        {active.map((p) => (
          <li
            key={p.id}
            className="rounded-full border border-paper-300 px-2 py-0.5 text-ink-200"
          >
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
