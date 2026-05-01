import { Link } from 'react-router-dom';

interface MoreItem {
  label: string;
  desc: string;
  to?: string;
  available: boolean;
}

const items: MoreItem[] = [
  {
    label: 'Calculator',
    desc: 'Reconstitute, dose volume, unit conversions',
    to: '/more/calculator',
    available: true,
  },
  {
    label: 'Insights',
    desc: 'Adherence, burn-down, custom metrics, exports',
    to: '/more/insights',
    available: true,
  },
  { label: 'Settings', desc: 'Local data, export, import', to: '/settings', available: true },
  { label: 'Education', desc: 'Reference notes for tracked items', available: false },
];

export function MorePage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl">More</h1>
        <p className="text-sm text-ink-100">
          Settings is live; the rest unlocks in later milestones.
        </p>
      </header>

      <ul className="ruled-y border border-paper-300 rounded-md">
        {items.map((item) =>
          item.available && item.to ? (
            <li key={item.label}>
              <Link
                to={item.to}
                className="block px-4 py-3 transition-colors duration-120 hover:bg-paper-200"
              >
                <p className="text-base">{item.label}</p>
                <p className="text-xs text-ink-100">{item.desc}</p>
              </Link>
            </li>
          ) : (
            <li key={item.label} className="px-4 py-3 opacity-60">
              <p className="text-base">{item.label}</p>
              <p className="text-xs text-ink-100">{item.desc}</p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
