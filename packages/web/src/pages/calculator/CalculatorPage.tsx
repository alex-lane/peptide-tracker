import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { getDb } from '@/db';
import { useActive } from '@/app/useActive';
import { ReconstituteTab } from './ReconstituteTab';
import { DoseTab } from './DoseTab';
import { ConversionTab } from './ConversionTab';

type TabValue = 'reconstitute' | 'dose' | 'conversion';

const VALID_TABS: TabValue[] = ['reconstitute', 'dose', 'conversion'];

export function CalculatorPage() {
  const active = useActive();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') ?? '') as TabValue;
  const initialItemId = searchParams.get('item');
  const [tab, setTab] = useState<TabValue>(
    VALID_TABS.includes(initialTab) ? initialTab : 'reconstitute',
  );
  // Per-tab product selection. The two tabs maintain independent state so a
  // product picked on one doesn't leak onto the other. The URL `?item=`
  // seeds whichever tab loads first.
  const [reconstituteItemId, setReconstituteItemId] = useState<string | null>(
    initialTab === 'reconstitute' ? initialItemId : null,
  );
  const [doseItemId, setDoseItemId] = useState<string | null>(
    initialTab === 'dose' ? initialItemId : null,
  );

  const db = getDb();
  const items = useLiveQuery(
    async () => {
      if (!active.householdId) return [];
      const all = await db.inventoryItems.where('householdId').equals(active.householdId).toArray();
      return all.filter((i) => !i.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
    },
    [active.householdId],
    [],
  );
  const batches = useLiveQuery(
    async () => {
      if (!active.householdId) return [];
      const all = await db.inventoryBatches
        .where('householdId')
        .equals(active.householdId)
        .toArray();
      return all.filter((b) => !b.deletedAt);
    },
    [active.householdId],
    [],
  );

  function activeItemId(forTab: TabValue): string | null {
    if (forTab === 'reconstitute') return reconstituteItemId;
    if (forTab === 'dose') return doseItemId;
    return null;
  }

  function handleTabChange(next: string) {
    if (!VALID_TABS.includes(next as TabValue)) return;
    const nextTab = next as TabValue;
    setTab(nextTab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', nextTab);
    const item = activeItemId(nextTab);
    if (item) params.set('item', item);
    else params.delete('item');
    setSearchParams(params, { replace: true });
  }

  function handleSelectReconstituteItem(id: string | null) {
    setReconstituteItemId(id);
    if (tab !== 'reconstitute') return;
    const params = new URLSearchParams(searchParams);
    if (id) params.set('item', id);
    else params.delete('item');
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  }

  function handleSelectDoseItem(id: string | null) {
    setDoseItemId(id);
    if (tab !== 'dose') return;
    const params = new URLSearchParams(searchParams);
    if (id) params.set('item', id);
    else params.delete('item');
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  }

  if (active.loading) {
    return <p className="text-sm text-ink-100">Loading…</p>;
  }
  if (!active.ready) {
    return (
      <p className="text-sm text-ink-100">
        Set up your household on the Today tab before using the calculator.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl">Calculator</h1>
        <p className="text-sm text-ink-100">
          Reconstitution, dose volume, and unit conversions. Enter your own protocol — the
          calculator never recommends a dose.
        </p>
      </header>

      <Tabs.Root value={tab} onValueChange={handleTabChange}>
        <Tabs.List className="flex border-b border-paper-300" aria-label="Calculator tabs">
          <TabTrigger value="reconstitute">Reconstitute</TabTrigger>
          <TabTrigger value="dose">Dose</TabTrigger>
          <TabTrigger value="conversion">Conversion</TabTrigger>
        </Tabs.List>

        <Tabs.Content value="reconstitute" className="space-y-4 pt-4">
          <ReconstituteTab
            items={items ?? []}
            selectedItemId={reconstituteItemId}
            onSelectItem={handleSelectReconstituteItem}
          />
        </Tabs.Content>
        <Tabs.Content value="dose" className="space-y-4 pt-4">
          <DoseTab
            items={items ?? []}
            batches={batches ?? []}
            selectedItemId={doseItemId}
            onSelectItem={handleSelectDoseItem}
          />
        </Tabs.Content>
        <Tabs.Content value="conversion" className="space-y-4 pt-4">
          <ConversionTab />
        </Tabs.Content>
      </Tabs.Root>

      <p className="text-xs text-ink-100">
        Tracking and calculation only — not medical advice. Verify the math before drawing.
      </p>
    </section>
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
