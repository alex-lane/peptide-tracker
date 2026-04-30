import type { InventoryBatch, InventoryItem } from '@/db';

const PRODUCT_FORM_LABELS: Record<InventoryItem['form'], string> = {
  injectable_lyophilized: 'Injectable (lyophilized)',
  injectable_solution: 'Injectable (solution)',
  capsule: 'Capsule',
  tablet: 'Tablet',
  powder_oral: 'Oral powder',
  spray_nasal: 'Nasal spray',
  spray_oral: 'Oral spray',
  drops_oral: 'Oral drops',
  drops_eye: 'Eye drops',
  topical_cream: 'Topical cream',
  topical_patch: 'Topical patch',
  supply: 'Supply',
};

const STATUS_LABELS: Record<InventoryBatch['status'], string> = {
  sealed: 'Sealed',
  reconstituted: 'Reconstituted',
  in_use: 'In use',
  empty: 'Empty',
  discarded: 'Discarded',
  expired: 'Expired',
};

const STATUS_PILL_CLASS: Record<InventoryBatch['status'], string> = {
  sealed: 'bg-paper-200 text-ink-200',
  reconstituted: 'bg-paper-200 text-ink-200',
  in_use: 'bg-success text-success-fg',
  empty: 'bg-paper-300 text-ink-100',
  discarded: 'bg-paper-300 text-ink-100',
  expired: 'bg-warn text-warn-fg',
};

export function labelForm(form: InventoryItem['form']): string {
  return PRODUCT_FORM_LABELS[form] ?? form;
}

export function labelStatus(status: InventoryBatch['status']): string {
  return STATUS_LABELS[status] ?? status;
}

export function pillClassForStatus(status: InventoryBatch['status']): string {
  return STATUS_PILL_CLASS[status] ?? STATUS_PILL_CLASS.sealed;
}

/** Days until expiry; negative when already expired; null when no expiry set. */
export function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.round((target - now) / (24 * 3600_000));
}
