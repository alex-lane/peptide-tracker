import { useMemo, useState } from 'react';
import { Plus, Package, Beaker, Pill as PillIcon, Wind, type LucideIcon } from 'lucide-react';
import type { InventoryItem } from '@/db';
import { useActive } from '@/app/useActive';
import { Modal } from '@/components/Modal';
import { ProductIcon } from '@/components/ProductIcon';
import { ItemForm } from './ItemForm';
import { ItemDetailModal } from './ItemDetailModal';
import { FillBar } from './fill-bar';
import { useInventory, type InventoryRow } from './useInventory';
import { daysUntil, labelForm, labelStatus, pillClassForStatus } from './formatting';

const FORM_FILTERS: ReadonlyArray<{
  value: 'all' | 'injectable' | 'oral' | 'topical';
  label: string;
  icon: LucideIcon;
}> = [
  { value: 'all', label: 'All', icon: Package },
  { value: 'injectable', label: 'Injectables', icon: Beaker },
  { value: 'oral', label: 'Oral', icon: PillIcon },
  { value: 'topical', label: 'Topical', icon: Wind },
] as const;

type FormFilter = (typeof FORM_FILTERS)[number]['value'];

function matchesFilter(form: InventoryItem['form'], filter: FormFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'injectable') return form.startsWith('injectable_');
  if (filter === 'oral') {
    return ['capsule', 'tablet', 'powder_oral', 'drops_oral', 'spray_oral'].includes(form);
  }
  if (filter === 'topical')
    return form.startsWith('topical_') || form === 'drops_eye' || form === 'spray_nasal';
  return true;
}

export function InventoryPage() {
  const active = useActive();
  const rows = useInventory(active.householdId);
  const [filter, setFilter] = useState<FormFilter>('all');
  const [adding, setAdding] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const filtered = useMemo(
    () => rows.filter((r) => matchesFilter(r.item.form, filter)),
    [rows, filter],
  );

  const openRow = openItemId ? (rows.find((r) => r.item.id === openItemId) ?? null) : null;

  if (active.loading) {
    return <p className="text-sm text-ink-100">Loading…</p>;
  }
  if (!active.ready) {
    return (
      <p className="text-sm text-ink-100">
        Set up your household on the Today tab before adding inventory.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/15 text-accent-cyan">
            <Package className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-0.5">
            <h1 className="text-xl">Inventory</h1>
            <p className="text-xs text-text-secondary">
              Vials, capsules, sprays, supplies — what's in the fridge.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-md bg-accent-primary px-3 py-2 text-sm text-white shadow-glow transition-colors hover:bg-accent-primary-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} /> Add
        </button>
      </header>

      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by form">
        {FORM_FILTERS.map((f) => {
          const Icon = f.icon;
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.value)}
              className={
                active
                  ? 'flex items-center gap-1.5 rounded-full bg-accent-primary px-3 py-1.5 text-xs text-white shadow-glow'
                  : 'flex items-center gap-1.5 rounded-full bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary hover:bg-border-subtle'
              }
            >
              <Icon className="h-3 w-3" aria-hidden />
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} hasAny={rows.length > 0} />
      ) : (
        <ul className="ruled-y rounded-md border border-paper-300">
          {filtered.map((row) => (
            <InventoryListRow
              key={row.item.id}
              row={row}
              onOpen={() => setOpenItemId(row.item.id)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={adding}
        onOpenChange={setAdding}
        title="Add product"
        description="Item template — separate from a specific batch / vial."
      >
        <ItemForm
          householdId={active.householdId!}
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      </Modal>

      {openRow && active.userId && (
        <ItemDetailModal
          open={openItemId !== null}
          onOpenChange={(o) => !o && setOpenItemId(null)}
          householdId={active.householdId!}
          activeUserId={active.userId}
          item={openRow.item}
          batches={openRow.batches}
        />
      )}
    </section>
  );
}

function InventoryListRow({ row, onOpen }: { row: InventoryRow; onOpen: () => void }) {
  const { item, batches, activeBatch } = row;
  const expiringSoon = activeBatch?.expiresAt
    ? (daysUntil(activeBatch.expiresAt) ?? 99) <= 14
    : false;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-3 py-3 text-left transition-colors duration-120 hover:bg-bg-elevated"
      >
        <div className="flex items-start gap-3">
          <ProductIcon form={item.form} />
          <div className="min-w-0 flex-1">
            <p className="text-base">{item.name}</p>
            <p className="text-xs text-text-muted">
              {labelForm(item.form)} · {batches.length} batch{batches.length === 1 ? '' : 'es'}
            </p>
            {activeBatch && (
              <p className="mt-1 text-sm">
                <span
                  className={`mr-2 inline-block rounded-sm px-1.5 py-0.5 text-[11px] ${pillClassForStatus(
                    activeBatch.status,
                  )}`}
                >
                  {labelStatus(activeBatch.status)}
                </span>
                <span className="num">{activeBatch.remainingQuantity}</span>
                {' / '}
                <span className="num">{activeBatch.initialQuantity}</span>{' '}
                {activeBatch.initialQuantityUnit}
                {expiringSoon && (
                  <span className="ml-2 rounded-sm bg-warn px-1.5 py-0.5 text-[11px] text-warn-fg">
                    expires soon
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {activeBatch && (
          <FillBar
            filled={activeBatch.remainingQuantity}
            total={activeBatch.initialQuantity}
            className="mt-2"
          />
        )}
      </button>
    </li>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <div className="rounded-md border border-paper-300 p-6 text-center">
      <p className="text-sm text-ink-100">
        {hasAny
          ? 'No products match this filter.'
          : 'No products yet — add your first one to start tracking.'}
      </p>
      {!hasAny && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 rounded-md bg-ink-300 px-3 py-2 text-sm text-paper-100 hover:bg-ink-200"
        >
          Add product
        </button>
      )}
    </div>
  );
}
