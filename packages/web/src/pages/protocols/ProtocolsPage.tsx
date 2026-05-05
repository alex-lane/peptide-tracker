import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ListOrdered } from 'lucide-react';
import {
  filterByShareScope,
  getDb,
  ProtocolRepo,
  type DoseSchedule,
  type InventoryBatch,
  type InventoryItem,
  type Protocol,
  type ProtocolItem,
  type UserProfile,
} from '@/db';
import { useActive } from '@/app/useActive';
import { listUsersInHousehold } from '@/app/active-household';
import { ProtocolBuilder } from './ProtocolBuilder';
import { describeRrule } from './rrule';
import { projectDepletion } from './depletion';
import { refreshSchedulesForProtocol } from './scheduleExpansion';

export function ProtocolsPage() {
  const active = useActive();
  const db = getDb();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{
    protocol: Protocol;
    items: ProtocolItem[];
  } | null>(null);

  const users = useLiveQuery(
    async () => (active.householdId ? await listUsersInHousehold(db, active.householdId) : []),
    [active.householdId],
    [],
  );
  const protocols = useLiveQuery(
    async () => {
      if (!active.householdId) return [];
      const rows = await db.protocols.where('householdId').equals(active.householdId).toArray();
      return rows
        .filter((p) => !p.deletedAt)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    },
    [active.householdId],
    [],
  );
  const allItems = useLiveQuery(
    async () => db.protocolItems.toArray(),
    [],
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
  const allSchedules = useLiveQuery(
    async () =>
      active.householdId
        ? (await db.doseSchedules.where('householdId').equals(active.householdId).toArray()).filter(
            (s) => !s.deletedAt,
          )
        : [],
    [active.householdId],
    [],
  );

  const itemsByProtocol = useMemo(() => {
    const m = new Map<string, ProtocolItem[]>();
    for (const it of allItems ?? []) {
      const list = m.get(it.protocolId) ?? [];
      list.push(it);
      m.set(it.protocolId, list);
    }
    return m;
  }, [allItems]);

  if (active.loading) return <p className="text-sm text-ink-100">Loading…</p>;
  if (!active.ready) {
    return (
      <p className="text-sm text-ink-100">
        Set up your household on the Today tab before adding protocols.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-pink/15 text-accent-pink">
            <ListOrdered className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-0.5">
            <h1 className="text-xl">Protocols</h1>
            <p className="text-xs text-text-secondary">
              Named stacks &amp; schedules per user. Activating expands 60 days of doses.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm text-white shadow-glow transition-colors hover:bg-accent-primary-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} /> New protocol
        </button>
      </header>

      {(protocols?.length ?? 0) === 0 ? (
        <div className="rounded-md border border-paper-300 p-6 text-center text-sm text-ink-100">
          No protocols yet — build your first one to start a schedule.
        </div>
      ) : (
        <ul className="space-y-3">
          {(protocols ?? []).map((p) => (
            <ProtocolCard
              key={p.id}
              protocol={p}
              items={itemsByProtocol.get(p.id) ?? []}
              users={users ?? []}
              inventoryItems={inventoryItems ?? []}
              inventoryBatches={inventoryBatches ?? []}
              schedules={(allSchedules ?? []).filter(
                (s) =>
                  s.protocolItemId &&
                  (itemsByProtocol.get(p.id) ?? []).some((it) => it.id === s.protocolItemId),
              )}
              onEdit={() => setEditing({ protocol: p, items: itemsByProtocol.get(p.id) ?? [] })}
            />
          ))}
        </ul>
      )}

      {active.householdId && active.userId && (
        <ProtocolBuilder
          open={creating}
          onOpenChange={setCreating}
          householdId={active.householdId}
          users={users ?? []}
          defaultUserId={active.userId}
        />
      )}
      {editing && active.householdId && active.userId && (
        <ProtocolBuilder
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          householdId={active.householdId}
          users={users ?? []}
          defaultUserId={active.userId}
          existing={editing}
        />
      )}
    </section>
  );
}

function ProtocolCard({
  protocol,
  items,
  users,
  inventoryItems,
  inventoryBatches,
  schedules,
  onEdit,
}: {
  protocol: Protocol;
  items: ProtocolItem[];
  users: UserProfile[];
  inventoryItems: InventoryItem[];
  inventoryBatches: InventoryBatch[];
  schedules: DoseSchedule[];
  onEdit: () => void;
}) {
  const user = users.find((u) => u.id === protocol.userId);
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  const forecasts = useMemo(
    () => projectDepletion({ items, batches: inventoryBatches, schedules }),
    [items, inventoryBatches, schedules],
  );

  async function toggleActive() {
    const db = getDb();
    const repo = new ProtocolRepo(db);
    const updated = await repo.upsert({ ...protocol, active: !protocol.active });
    await refreshSchedulesForProtocol(db, updated, items);
  }

  return (
    <li className="rounded-md border border-paper-300 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base">
            {protocol.name}
            <span
              className={`ml-2 rounded-sm px-1.5 py-0.5 text-[11px] ${
                protocol.active ? 'bg-success/30 text-success' : 'bg-paper-200 text-ink-100'
              }`}
            >
              {protocol.active ? 'Active' : 'Inactive'}
            </span>
          </p>
          <p className="text-xs text-ink-100">
            For {user?.displayName ?? '—'} · starts {protocol.startDate}
            {protocol.endDate ? ` → ${protocol.endDate}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void toggleActive()}
            className="rounded-md border border-paper-300 px-2 py-1 text-xs text-ink-200 hover:bg-paper-200"
          >
            {protocol.active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-paper-300 px-2 py-1 text-xs text-ink-200 hover:bg-paper-200"
          >
            Edit
          </button>
        </div>
      </div>

      <ul className="ruled-y mt-2 rounded-md border border-paper-300 text-sm">
        {items.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-100">No items in this protocol yet.</li>
        )}
        {items.map((it) => {
          const f = forecasts.find((x) => x.protocolItemId === it.id);
          return (
            <li key={it.id} className="px-3 py-2">
              <p>{itemNameById.get(it.itemId) ?? '—'}</p>
              <p className="text-xs text-ink-100">
                <span className="num">{it.doseAmount}</span> {it.doseUnit} ·{' '}
                {it.method.toUpperCase()} · {describeRrule(it.rrule)} at {it.localStartTime}{' '}
                {it.timezone}
              </p>
              {f && (
                <p className="mt-1 text-xs">
                  {f.depletesOn ? (
                    <span className="text-warn">Projected to deplete on {f.depletesOn}</span>
                  ) : f.reason ? (
                    <span className="text-ink-100">Depletion not projected ({f.reason}).</span>
                  ) : (
                    <span className="text-ink-100">
                      {f.dosesProjected} pending dose{f.dosesProjected === 1 ? '' : 's'} — batch
                      not yet drained.
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
