export function MorePage() {
  const items = [
    { label: 'Calculator', desc: 'Reconstitute / Dose / Conversion (M6)' },
    { label: 'Insights', desc: 'Adherence, burn-down, custom metrics (M10)' },
    { label: 'Education', desc: 'Reference notes for tracked items' },
    { label: 'Settings', desc: 'Calendar feeds, sync, export, account' },
  ];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl">More</h1>
        <p className="text-sm text-ink-100">
          Calculator, insights, education library, and settings live here.
        </p>
      </header>

      <ul className="ruled-y border border-paper-300 rounded-md">
        {items.map((item) => (
          <li key={item.label} className="px-4 py-3">
            <p className="text-base">{item.label}</p>
            <p className="text-xs text-ink-100">{item.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
