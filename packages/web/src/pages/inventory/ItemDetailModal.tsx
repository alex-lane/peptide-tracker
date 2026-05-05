import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useNavigate } from 'react-router-dom';
import { getDb, InventoryBatchRepo, InventoryItemRepo, nowIso } from '@/db';
import type { InventoryBatch, InventoryItem } from '@/db';
import { Modal } from '@/components/Modal';
import { ItemForm } from './ItemForm';
import { BatchForm } from './BatchForm';
import { ReconstituteForm } from './ReconstituteForm';
import { FillBar } from './fill-bar';
import { daysUntil, labelForm, labelStatus, pillClassForStatus } from './formatting';
import { canTransition } from './status-machine';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: string;
  activeUserId: string;
  item: InventoryItem;
  batches: InventoryBatch[];
}

type Pane = 'detail' | 'edit-item' | 'add-batch' | 'edit-batch' | 'reconstitute';

export function ItemDetailModal({
  open,
  onOpenChange,
  householdId,
  activeUserId,
  item,
  batches,
}: Props) {
  const [pane, setPane] = useState<Pane>('detail');
  const [targetBatch, setTargetBatch] = useState<InventoryBatch | null>(null);
  const navigate = useNavigate();

  function back() {
    setPane('detail');
    setTargetBatch(null);
  }

  async function transitionStatus(batch: InventoryBatch, to: InventoryBatch['status']) {
    if (!canTransition(batch.status, to)) return;
    const repo = new InventoryBatchRepo(getDb());
    await repo.upsert({ ...batch, status: to, updatedAt: nowIso() });
  }

  async function deleteBatch(batch: InventoryBatch) {
    const desc = batch.lotNumber
      ? `lot ${batch.lotNumber}`
      : `${batch.initialQuantity} ${batch.initialQuantityUnit}`;
    const ok = window.confirm(
      `Delete this batch (${desc})? This is a soft delete — the row is hidden but can be restored from a JSON export. Use this when you need to wipe a fat-finger entry.`,
    );
    if (!ok) return;
    const repo = new InventoryBatchRepo(getDb());
    await repo.softDelete(batch.id);
  }

  async function deleteItem() {
    const ok = window.confirm(
      `Delete "${item.name}"? This soft-deletes the product template; existing batches stay until you delete them individually.`,
    );
    if (!ok) return;
    const repo = new InventoryItemRepo(getDb());
    await repo.softDelete(item.id);
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={pane === 'detail' ? item.name : titleFor(pane)}
      description={pane === 'detail' ? labelForm(item.form) : undefined}
    >
      {pane === 'edit-item' && (
        <ItemForm
          householdId={householdId}
          activeUserId={activeUserId}
          initial={item}
          onSaved={back}
          onCancel={back}
        />
      )}
      {pane === 'add-batch' && (
        <BatchForm householdId={householdId} item={item} onSaved={back} onCancel={back} />
      )}
      {pane === 'edit-batch' && targetBatch && (
        <BatchForm
          householdId={householdId}
          item={item}
          initial={targetBatch}
          onSaved={back}
          onCancel={back}
        />
      )}
      {pane === 'reconstitute' && targetBatch && (
        <ReconstituteForm
          item={item}
          batch={targetBatch}
          activeUserId={activeUserId}
          onSaved={back}
          onCancel={back}
        />
      )}
      {pane === 'detail' && (
        <Tabs.Root defaultValue="batches">
          <Tabs.List className="flex border-b border-paper-300" aria-label="Item tabs">
            <TabTrigger value="batches">Batches</TabTrigger>
            <TabTrigger value="overview">Overview</TabTrigger>
            <TabTrigger value="notes">Notes</TabTrigger>
          </Tabs.List>

          <Tabs.Content value="batches" className="space-y-3 pt-4">
            {batches.length === 0 ? (
              <p className="text-sm text-ink-100">No batches yet for this product.</p>
            ) : (
              <ul className="ruled-y rounded-md border border-paper-300">
                {batches
                  .slice()
                  .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''))
                  .map((b) => (
                    <li key={b.id} className="px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block rounded-sm px-1.5 py-0.5 text-[11px] ${pillClassForStatus(b.status)}`}
                            >
                              {labelStatus(b.status)}
                            </span>
                            {b.lotNumber && (
                              <span className="font-mono text-xs text-ink-100">
                                lot {b.lotNumber}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm">
                            <span className="num">{b.remainingQuantity}</span> /{' '}
                            <span className="num">{b.initialQuantity}</span> {b.initialQuantityUnit}
                          </p>
                          <FillBar
                            filled={b.remainingQuantity}
                            total={b.initialQuantity}
                            className="mt-2"
                          />
                          {b.expiresAt && <ExpiryNote iso={b.expiresAt} />}
                          {b.reconstitution && (
                            <p className="mt-1 text-xs text-ink-100">
                              Reconstituted with{' '}
                              <span className="num">{b.reconstitution.diluentVolumeMl}mL</span>{' '}
                              {b.reconstitution.diluentType.replace('_', ' ')} →{' '}
                              <span className="num">
                                {b.reconstitution.resultingConcentration.value}{' '}
                                {b.reconstitution.resultingConcentration.unit}
                              </span>
                              /mL
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {b.status === 'sealed' && item.form === 'injectable_lyophilized' && (
                          <BatchAction
                            label="Reconstitute"
                            onClick={() => {
                              setTargetBatch(b);
                              setPane('reconstitute');
                            }}
                          />
                        )}
                        {canTransition(b.status, 'in_use') && (
                          <BatchAction
                            label="Mark in use"
                            onClick={() => void transitionStatus(b, 'in_use')}
                          />
                        )}
                        {canTransition(b.status, 'empty') && (
                          <BatchAction
                            label="Mark empty"
                            onClick={() => void transitionStatus(b, 'empty')}
                          />
                        )}
                        {canTransition(b.status, 'discarded') && (
                          <BatchAction
                            label="Discard"
                            onClick={() => {
                              if (window.confirm('Discard this batch?')) {
                                void transitionStatus(b, 'discarded');
                              }
                            }}
                          />
                        )}
                        <BatchAction
                          label="Calculate dose"
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/more/calculator?tab=dose&item=${item.id}`);
                          }}
                        />
                        <BatchAction
                          label="Edit"
                          onClick={() => {
                            setTargetBatch(b);
                            setPane('edit-batch');
                          }}
                        />
                        <BatchAction
                          label="Delete"
                          tone="danger"
                          onClick={() => void deleteBatch(b)}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPane('add-batch')}
                className="rounded-md bg-accent-primary px-3 py-2 text-sm text-white hover:bg-accent-primary-hover shadow-glow"
              >
                Add batch
              </button>
            </div>
          </Tabs.Content>

          <Tabs.Content value="overview" className="space-y-3 pt-4 text-sm">
            <Field label="Form">{labelForm(item.form)}</Field>
            {item.defaultStrength && (
              <Field label="Default strength">
                <span className="num">
                  {item.defaultStrength.value} {item.defaultStrength.unit}
                </span>
              </Field>
            )}
            {item.defaultUnitOfDose && (
              <Field label="Default dose unit">
                <span className="num">{item.defaultUnitOfDose}</span>
              </Field>
            )}
            {item.vendor && <Field label="Vendor">{item.vendor}</Field>}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={deleteItem}
                className="rounded-md border border-paper-300 px-3 py-2 text-sm text-danger hover:bg-paper-200"
              >
                Delete product
              </button>
              <button
                type="button"
                onClick={() => setPane('edit-item')}
                className="rounded-md bg-accent-primary px-3 py-2 text-sm text-white hover:bg-accent-primary-hover shadow-glow"
              >
                Edit product
              </button>
            </div>
          </Tabs.Content>

          <Tabs.Content value="notes" className="pt-4 text-sm">
            {item.notesMd ? (
              <pre className="whitespace-pre-wrap font-mono text-xs">{item.notesMd}</pre>
            ) : (
              <p className="text-ink-100">No notes.</p>
            )}
          </Tabs.Content>
        </Tabs.Root>
      )}
    </Modal>
  );
}

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-ink-100 data-[state=active]:border-ink-300 data-[state=active]:text-ink-300"
    >
      {children}
    </Tabs.Trigger>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-100">{label}</p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  );
}

function BatchAction({
  label,
  onClick,
  tone = 'neutral',
}: {
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === 'danger'
          ? 'rounded-md border border-paper-300 px-2.5 py-1 text-xs text-danger hover:bg-paper-200'
          : 'rounded-md border border-paper-300 px-2.5 py-1 text-xs text-ink-200 hover:bg-paper-200'
      }
    >
      {label}
    </button>
  );
}

function ExpiryNote({ iso }: { iso: string }) {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < 0) {
    return <p className="mt-1 text-xs text-danger">Expired {-days}d ago</p>;
  }
  if (days <= 14) {
    return <p className="mt-1 text-xs text-warn">Expires in {days}d</p>;
  }
  return (
    <p className="mt-1 text-xs text-ink-100">
      Expires <span className="num">{iso.slice(0, 10)}</span>
    </p>
  );
}

function titleFor(pane: Pane): string {
  switch (pane) {
    case 'edit-item':
      return 'Edit product';
    case 'add-batch':
      return 'Add batch';
    case 'edit-batch':
      return 'Edit batch';
    case 'reconstitute':
      return 'Reconstitute';
    default:
      return '';
  }
}
