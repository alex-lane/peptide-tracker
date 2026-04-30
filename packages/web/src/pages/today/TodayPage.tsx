import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/db';
import { HouseholdBootstrap } from '@/app/HouseholdBootstrap';
import { useActive } from '@/app/useActive';

export function TodayPage() {
  const active = useActive();
  const db = getDb();
  const user = useLiveQuery(
    async () => (active.userId ? await db.userProfiles.get(active.userId) : undefined),
    [active.userId],
  );

  if (active.loading) {
    return <div className="text-sm text-ink-100">Loading…</div>;
  }

  if (!active.ready) {
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
      <header className="space-y-1">
        <h1 className="text-xl">{user?.displayName ?? 'Today'}'s day</h1>
        <p className="text-sm text-ink-100">
          Schedules and dose logs land here in M7 / M8. Add inventory now to be ready.
        </p>
      </header>

      <div className="rounded-md border border-paper-300 p-4">
        <h2 className="mb-2 text-base">Pending doses</h2>
        <p className="text-sm text-ink-100">
          When schedules exist, they will appear here as a checklist. Tap a row to log it.
        </p>
      </div>

      <div className="rounded-md border border-paper-300 p-4">
        <h2 className="mb-2 text-base">Inventory warnings</h2>
        <p className="text-sm text-ink-100">No inventory tracked yet.</p>
      </div>
    </section>
  );
}
