export function TodayPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl">Today</h1>
        <p className="text-sm text-ink-100">No active user data yet. Scaffolding only.</p>
      </header>

      <div className="rounded-md border border-paper-300 p-4">
        <h2 className="text-base mb-2">Pending doses</h2>
        <p className="text-sm text-ink-100">
          When schedules exist, they will appear here as a checklist. Tap a row to log it.
        </p>
      </div>

      <div className="rounded-md border border-paper-300 p-4">
        <h2 className="text-base mb-2">Inventory warnings</h2>
        <p className="text-sm text-ink-100">No inventory tracked yet.</p>
      </div>
    </section>
  );
}
