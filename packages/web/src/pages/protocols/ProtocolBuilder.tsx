import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import {
  getDb,
  newId,
  nowIso,
  ProtocolItemRepo,
  ProtocolRepo,
  type InventoryBatch,
  type InventoryItem,
  type Protocol,
  type ProtocolItem,
  type UserProfile,
} from '@/db';
import { Modal } from '@/components/Modal';
import {
  describeRrule,
  deviceTimeZone,
  isValidRruleForBuilder,
  recognizeRrule,
  rrulePresetToString,
} from './rrule';
import { refreshSchedulesForProtocol } from './scheduleExpansion';

interface DraftItem {
  id?: string;
  itemId: string;
  doseAmount: string;
  doseUnit: 'mcg' | 'mg' | 'g' | 'IU';
  method: 'subq' | 'im' | 'iv' | 'oral' | 'sublingual' | 'nasal' | 'topical' | 'inhaled' | 'other';
  rrule: string;
  timezone: string;
  localStartTime: string;
  cycleOn: string;
  cycleOff: string;
  preferredBatchId?: string | undefined;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: string;
  users: UserProfile[];
  defaultUserId: string;
  /** Optional existing protocol to edit (with its items pre-loaded). */
  existing?: { protocol: Protocol; items: ProtocolItem[] };
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export function ProtocolBuilder({
  open,
  onOpenChange,
  householdId,
  users,
  defaultUserId,
  existing,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [userId, setUserId] = useState(defaultUserId);
  const [startDate, setStartDate] = useState(TODAY());
  const [endDate, setEndDate] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when opening / load existing.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.protocol.name);
      setUserId(existing.protocol.userId);
      setStartDate(existing.protocol.startDate);
      setEndDate(existing.protocol.endDate ?? '');
      setItems(
        existing.items.map((i) => ({
          id: i.id,
          itemId: i.itemId,
          doseAmount: String(i.doseAmount),
          doseUnit: (i.doseUnit === 'mcg' ||
          i.doseUnit === 'mg' ||
          i.doseUnit === 'g' ||
          i.doseUnit === 'IU'
            ? i.doseUnit
            : 'mcg') as DraftItem['doseUnit'],
          method: i.method as DraftItem['method'],
          rrule: i.rrule,
          timezone: i.timezone,
          localStartTime: i.localStartTime,
          cycleOn: i.cycle ? String(i.cycle.onDays) : '',
          cycleOff: i.cycle ? String(i.cycle.offDays) : '',
          ...(i.preferredBatchId ? { preferredBatchId: i.preferredBatchId } : {}),
        })),
      );
    } else {
      setName('');
      setUserId(defaultUserId);
      setStartDate(TODAY());
      setEndDate('');
      setItems([]);
    }
    setStep(1);
    setError(null);
  }, [open, existing, defaultUserId]);

  const db = getDb();
  const inventoryItems = useLiveQuery(
    async () => {
      const all = await db.inventoryItems.where('householdId').equals(householdId).toArray();
      return all.filter((i) => !i.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    },
    [householdId],
    [],
  );
  const inventoryBatches = useLiveQuery(
    async () => {
      const all = await db.inventoryBatches.where('householdId').equals(householdId).toArray();
      return all.filter((b) => !b.deletedAt);
    },
    [householdId],
    [],
  );

  const stepValid = useMemo(() => stepIsValid(step, { name, userId, startDate, endDate, items }), [
    step,
    name,
    userId,
    startDate,
    endDate,
    items,
  ]);

  function next() {
    if (!stepValid) return;
    setStep((s) => (s === 1 ? 2 : 3));
  }
  function back() {
    setStep((s) => (s === 3 ? 2 : 1));
  }

  async function activate(activeNow: boolean) {
    setBusy(true);
    setError(null);
    try {
      const db = getDb();
      const protoRepo = new ProtocolRepo(db);
      const itemRepo = new ProtocolItemRepo(db);
      const protoId = existing?.protocol.id ?? newId();
      const protocol: Protocol = {
        id: protoId,
        householdId,
        userId,
        createdAt: existing?.protocol.createdAt ?? nowIso(),
        updatedAt: nowIso(),
        version: existing?.protocol.version ?? 0,
        name: name.trim(),
        active: activeNow,
        startDate,
        ...(endDate ? { endDate } : {}),
      };
      await protoRepo.upsert(protocol);

      // Replace ProtocolItems wholesale: simpler than diffing for v1.
      await itemRepo.deleteForProtocol(protoId);
      const itemRows: ProtocolItem[] = [];
      for (const i of items) {
        const row: ProtocolItem = {
          id: i.id ?? newId(),
          protocolId: protoId,
          itemId: i.itemId,
          doseAmount: Number(i.doseAmount),
          doseUnit: i.doseUnit,
          method: i.method,
          rrule: i.rrule,
          timezone: i.timezone,
          localStartTime: i.localStartTime,
          ...(i.cycleOn && i.cycleOff
            ? { cycle: { onDays: Number(i.cycleOn), offDays: Number(i.cycleOff) } }
            : {}),
          ...(i.preferredBatchId ? { preferredBatchId: i.preferredBatchId } : {}),
        };
        await itemRepo.upsert(row);
        itemRows.push(row);
      }

      // Expand schedules for the next 60 days (or wipe if inactive).
      await refreshSchedulesForProtocol(db, protocol, itemRows);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? 'Edit protocol' : 'New protocol'}
      description="Your stack of products + schedules. The calculator never recommends a dose; you set it."
    >
      <ol className="mb-4 flex gap-2 text-xs text-ink-100">
        <StepPill n={1} current={step}>
          Basics
        </StepPill>
        <StepPill n={2} current={step}>
          Items
        </StepPill>
        <StepPill n={3} current={step}>
          Review
        </StepPill>
      </ol>

      {step === 1 && (
        <BasicsStep
          name={name}
          onName={setName}
          userId={userId}
          onUserId={setUserId}
          users={users}
          startDate={startDate}
          onStartDate={setStartDate}
          endDate={endDate}
          onEndDate={setEndDate}
        />
      )}
      {step === 2 && (
        <ItemsStep
          items={items}
          onItems={setItems}
          inventoryItems={inventoryItems ?? []}
          inventoryBatches={inventoryBatches ?? []}
        />
      )}
      {step === 3 && (
        <ReviewStep
          protocol={{ name, userId, startDate, endDate }}
          users={users}
          items={items}
          inventoryItems={inventoryItems ?? []}
        />
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={step === 1 ? () => onOpenChange(false) : back}
          className="rounded-md px-3 py-1.5 text-sm text-ink-100 hover:bg-paper-200"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step !== 3 ? (
          <button
            type="button"
            disabled={!stepValid}
            onClick={next}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-white hover:bg-accent-primary-hover shadow-glow disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void activate(false)}
              className="rounded-md border border-paper-300 px-3 py-1.5 text-sm text-ink-200 hover:bg-paper-200 disabled:opacity-50"
            >
              Save (inactive)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void activate(true)}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-white hover:bg-accent-primary-hover shadow-glow disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Activate'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function stepIsValid(
  step: 1 | 2 | 3,
  s: { name: string; userId: string; startDate: string; endDate: string; items: DraftItem[] },
): boolean {
  if (step === 1) {
    if (!s.name.trim() || !s.userId || !s.startDate) return false;
    if (s.endDate && s.endDate < s.startDate) return false;
    return true;
  }
  if (step === 2) {
    if (s.items.length === 0) return false;
    return s.items.every(
      (i) =>
        i.itemId &&
        i.doseAmount.trim() &&
        Number.isFinite(Number(i.doseAmount)) &&
        Number(i.doseAmount) > 0 &&
        i.rrule.trim() &&
        /^\d{2}:\d{2}$/.test(i.localStartTime) &&
        (!i.cycleOn || (Number(i.cycleOn) > 0 && Number(i.cycleOff) >= 0)) &&
        isValidRruleForBuilder(i.rrule, i.timezone, i.localStartTime),
    );
  }
  return true;
}

function StepPill({
  n,
  current,
  children,
}: {
  n: 1 | 2 | 3;
  current: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const active = n === current;
  return (
    <li
      className={`rounded-full px-2 py-0.5 ${active ? 'bg-accent-primary text-white shadow-glow' : 'bg-bg-elevated text-text-secondary'}`}
    >
      {n}. {children}
    </li>
  );
}

function BasicsStep(props: {
  name: string;
  onName: (v: string) => void;
  userId: string;
  onUserId: (v: string) => void;
  users: UserProfile[];
  startDate: string;
  onStartDate: (v: string) => void;
  endDate: string;
  onEndDate: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="block font-medium">Name</span>
        <input
          required
          value={props.name}
          onChange={(e) => props.onName(e.target.value)}
          maxLength={120}
          placeholder="e.g. Healing stack, Morning oral"
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="block font-medium">User</span>
        <select
          value={props.userId}
          onChange={(e) => props.onUserId(e.target.value)}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        >
          {props.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="block font-medium">Start date</span>
          <input
            type="date"
            value={props.startDate}
            onChange={(e) => props.onStartDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">End date (optional)</span>
          <input
            type="date"
            value={props.endDate}
            onChange={(e) => props.onEndDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function ItemsStep(props: {
  items: DraftItem[];
  onItems: (items: DraftItem[]) => void;
  inventoryItems: InventoryItem[];
  inventoryBatches: InventoryBatch[];
}) {
  function addItem() {
    const first = props.inventoryItems[0];
    props.onItems([
      ...props.items,
      {
        itemId: first?.id ?? '',
        doseAmount: '',
        doseUnit: 'mcg',
        method: 'subq',
        rrule: 'FREQ=DAILY',
        timezone: deviceTimeZone(),
        localStartTime: '08:00',
        cycleOn: '',
        cycleOff: '',
      },
    ]);
  }
  function update(idx: number, patch: Partial<DraftItem>) {
    props.onItems(props.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx: number) {
    props.onItems(props.items.filter((_, i) => i !== idx));
  }

  if (props.inventoryItems.length === 0) {
    return (
      <p className="text-sm text-ink-100">
        Add a product on the Inventory tab first — protocol items reference inventory products.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {props.items.map((it, idx) => (
        <ItemForm
          key={idx}
          draft={it}
          inventoryItems={props.inventoryItems}
          inventoryBatches={props.inventoryBatches}
          onChange={(patch) => update(idx, patch)}
          onRemove={() => remove(idx)}
        />
      ))}
      <button
        type="button"
        onClick={addItem}
        className="touch-lg w-full rounded-md border border-paper-300 px-3 py-2 text-sm hover:bg-paper-200"
      >
        + Add an item
      </button>
    </div>
  );
}

function ItemForm({
  draft,
  inventoryItems,
  inventoryBatches,
  onChange,
  onRemove,
}: {
  draft: DraftItem;
  inventoryItems: InventoryItem[];
  inventoryBatches: InventoryBatch[];
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const preset = recognizeRrule(draft.rrule);
  const itemBatches = inventoryBatches.filter((b) => b.itemId === draft.itemId);
  return (
    <div className="space-y-3 rounded-md border border-paper-300 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-100">Item</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove item"
          className="rounded-md p-1 text-ink-100 hover:bg-paper-200"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <label className="block text-sm">
        <span className="block font-medium">Product</span>
        <select
          value={draft.itemId}
          onChange={(e) => onChange({ itemId: e.target.value, preferredBatchId: undefined })}
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        >
          {inventoryItems.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm col-span-1">
          <span className="block font-medium">Dose</span>
          <input
            inputMode="decimal"
            value={draft.doseAmount}
            onChange={(e) => onChange({ doseAmount: e.target.value })}
            placeholder="250"
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block text-sm col-span-1">
          <span className="block font-medium">Unit</span>
          <select
            value={draft.doseUnit}
            onChange={(e) => onChange({ doseUnit: e.target.value as DraftItem['doseUnit'] })}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="mcg">mcg</option>
            <option value="mg">mg</option>
            <option value="g">g</option>
            <option value="IU">IU</option>
          </select>
        </label>
        <label className="block text-sm col-span-1">
          <span className="block font-medium">Route</span>
          <select
            value={draft.method}
            onChange={(e) => onChange({ method: e.target.value as DraftItem['method'] })}
            className="touch-lg mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="subq">SubQ</option>
            <option value="im">IM</option>
            <option value="oral">Oral</option>
            <option value="sublingual">Sublingual</option>
            <option value="nasal">Nasal</option>
            <option value="topical">Topical</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="block font-medium">Schedule</legend>
        <div className="mt-2 flex flex-wrap gap-1">
          <PresetBtn
            active={preset.kind === 'daily'}
            onClick={() => onChange({ rrule: rrulePresetToString({ kind: 'daily' }) })}
          >
            Every day
          </PresetBtn>
          <PresetBtn
            active={preset.kind === 'mwf'}
            onClick={() => onChange({ rrule: rrulePresetToString({ kind: 'mwf' }) })}
          >
            Mon / Wed / Fri
          </PresetBtn>
          <PresetBtn
            active={preset.kind === 'tth'}
            onClick={() => onChange({ rrule: rrulePresetToString({ kind: 'tth' }) })}
          >
            Tue / Thu
          </PresetBtn>
          <PresetBtn
            active={preset.kind === 'every_n_days'}
            onClick={() =>
              onChange({ rrule: rrulePresetToString({ kind: 'every_n_days', n: 3 }) })
            }
          >
            Every N days
          </PresetBtn>
          <PresetBtn
            active={preset.kind === 'custom'}
            onClick={() => onChange({ rrule: 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1' })}
          >
            Custom
          </PresetBtn>
        </div>
        {preset.kind === 'every_n_days' && (
          <label className="mt-2 flex items-center gap-2 text-xs">
            <span>N =</span>
            <input
              type="number"
              min={2}
              max={30}
              value={preset.n}
              onChange={(e) => {
                const n = Math.max(2, Math.min(30, Number(e.target.value) || 2));
                onChange({ rrule: rrulePresetToString({ kind: 'every_n_days', n }) });
              }}
              className="w-16 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 font-mono"
            />
            <span className="text-ink-100">days</span>
          </label>
        )}
        {preset.kind === 'custom' && (
          <label className="mt-2 block text-xs">
            <span className="block font-medium">Custom RRULE (RFC-5545 body)</span>
            <input
              value={draft.rrule}
              onChange={(e) => onChange({ rrule: e.target.value })}
              placeholder="FREQ=DAILY;INTERVAL=2"
              className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-2 py-1 font-mono"
            />
            <span className="mt-1 block text-ink-100">{describeRrule(draft.rrule)}</span>
            {!isValidRruleForBuilder(draft.rrule, draft.timezone, draft.localStartTime) && (
              <span className="mt-1 block text-warn">
                RRULE doesn't parse against this timezone — fix before activating.
              </span>
            )}
          </label>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="block font-medium">Time</span>
          <input
            type="time"
            value={draft.localStartTime}
            onChange={(e) => onChange({ localStartTime: e.target.value })}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Timezone</span>
          <input
            value={draft.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 font-mono text-xs"
          />
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="block font-medium">Cycle (optional)</legend>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-100">
          <input
            inputMode="numeric"
            value={draft.cycleOn}
            onChange={(e) => onChange({ cycleOn: e.target.value })}
            placeholder="5"
            className="w-12 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-center font-mono"
          />
          <span>days on /</span>
          <input
            inputMode="numeric"
            value={draft.cycleOff}
            onChange={(e) => onChange({ cycleOff: e.target.value })}
            placeholder="2"
            className="w-12 rounded-md border border-paper-300 bg-paper-50 px-2 py-1 text-center font-mono"
          />
          <span>days off</span>
        </div>
        <span className="mt-1 block text-xs text-ink-100">
          Leave both blank for no cycle. Useful for "5 on / 2 off" stacks.
        </span>
      </fieldset>

      {itemBatches.length > 0 && (
        <label className="block text-sm">
          <span className="block font-medium">Preferred batch (optional)</span>
          <select
            value={draft.preferredBatchId ?? ''}
            onChange={(e) =>
              onChange({
                preferredBatchId: e.target.value === '' ? undefined : e.target.value,
              })
            }
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
          >
            <option value="">— No preference —</option>
            {itemBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.lotNumber ? `Lot ${b.lotNumber} — ` : ''}
                {b.remainingQuantity}/{b.initialQuantity} {b.initialQuantityUnit} ({b.status})
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-100">
            Hint only. Forecasts pull from this batch; logging may use any.
          </span>
        </label>
      )}
    </div>
  );
}

function PresetBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full bg-accent-primary px-3 py-1.5 text-xs text-white shadow-glow'
          : 'rounded-full bg-paper-200 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-300'
      }
    >
      {children}
    </button>
  );
}

function ReviewStep({
  protocol,
  users,
  items,
  inventoryItems,
}: {
  protocol: { name: string; userId: string; startDate: string; endDate: string };
  users: UserProfile[];
  items: DraftItem[];
  inventoryItems: InventoryItem[];
}) {
  const user = users.find((u) => u.id === protocol.userId);
  const itemNameById = new Map(inventoryItems.map((i) => [i.id, i.name]));
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-paper-300 p-3">
        <p>
          <span className="font-medium">{protocol.name}</span> —{' '}
          <span className="text-ink-100">for {user?.displayName ?? '—'}</span>
        </p>
        <p className="mt-1 text-xs text-ink-100">
          {protocol.startDate}
          {protocol.endDate ? ` → ${protocol.endDate}` : ' (no end date)'}
        </p>
      </div>
      <ul className="ruled-y rounded-md border border-paper-300">
        {items.map((it, i) => (
          <li key={i} className="px-3 py-2">
            <p className="text-sm">{itemNameById.get(it.itemId) ?? '—'}</p>
            <p className="text-xs text-ink-100">
              <span className="num">{it.doseAmount}</span> {it.doseUnit} · {it.method.toUpperCase()}
              {' · '}
              {describeRrule(it.rrule)} at {it.localStartTime} {it.timezone}
              {it.cycleOn && it.cycleOff
                ? ` · ${it.cycleOn} on / ${it.cycleOff} off`
                : ''}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-100">
        Activating expands the next 60 days into your schedule. Edit later from the protocol list;
        logged doses are preserved.
      </p>
    </div>
  );
}
