import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { Beaker, Calculator, ArrowLeftRight } from 'lucide-react';
import { filterByShareScope, getDb } from '@/db';
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
      const visible = filterByShareScope(
        all.filter((i) => !i.deletedAt),
        active.userId,
      );
      return visible.sort((a, b) => a.name.localeCompare(b.name));
    },
    [active.householdId, active.userId],
    [],
  );
  const batches = useLiveQuery(
    async () => {
      if (!active.householdId) return [];
      const all = await db.inventoryBatches
        .where('householdId')
        .equals(active.householdId)
        .toArray();
      return filterByShareScope(
        all.filter((b) => !b.deletedAt),
        active.userId,
      );
    },
    [active.householdId, active.userId],
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
      <header className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-primary">
          <Calculator className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-xl">Calculator</h1>
          <p className="text-xs text-text-secondary">
            Reconstitution, dose volume, and unit conversions.
          </p>
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={handleTabChange}>
        <Tabs.List className="flex gap-1 border-b border-border-subtle" aria-label="Calculator tabs">
          <TabTrigger value="reconstitute" icon={<Beaker className="h-3.5 w-3.5" aria-hidden />}>
            Reconstitute
          </TabTrigger>
          <TabTrigger value="dose" icon={<Calculator className="h-3.5 w-3.5" aria-hidden />}>
            Dose
          </TabTrigger>
          <TabTrigger value="conversion" icon={<ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />}>
            Conversion
          </TabTrigger>
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
    </section>
  );
}

function TabTrigger({
  value,
  icon,
  children,
}: {
  value: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary data-[state=active]:border-accent-primary data-[state=active]:text-accent-primary"
    >
      {icon}
      {children}
    </Tabs.Trigger>
  );
}
