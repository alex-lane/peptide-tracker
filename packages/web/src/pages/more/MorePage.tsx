import { Link } from 'react-router-dom';
import {
  Calculator,
  Settings as SettingsIcon,
  TrendingUp,
  ChevronRight,
  type LucideIcon,
  MoreHorizontal,
} from 'lucide-react';

interface MoreItem {
  label: string;
  desc: string;
  to?: string;
  available: boolean;
  icon: LucideIcon;
  tone: 'primary' | 'cyan' | 'pink' | 'neutral';
}

const items: MoreItem[] = [
  {
    label: 'Calculator',
    desc: 'Reconstitute, dose volume, unit conversions',
    to: '/more/calculator',
    available: true,
    icon: Calculator,
    tone: 'primary',
  },
  {
    label: 'Insights',
    desc: 'Adherence, burn-down, custom metrics, exports',
    to: '/more/insights',
    available: true,
    icon: TrendingUp,
    tone: 'cyan',
  },
  {
    label: 'Settings',
    desc: 'Local data, export, import, calendar',
    to: '/settings',
    available: true,
    icon: SettingsIcon,
    tone: 'pink',
  },
];

const TONE_BG: Record<MoreItem['tone'], string> = {
  primary: 'bg-accent-primary/15 text-accent-primary',
  cyan: 'bg-accent-cyan/15 text-accent-cyan',
  pink: 'bg-accent-pink/15 text-accent-pink',
  neutral: 'bg-bg-elevated text-text-muted',
};

export function MorePage() {
  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-primary">
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-xl">More</h1>
          <p className="text-xs text-text-secondary">Tools, settings, and reference content.</p>
        </div>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          const inner = (
            <>
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${TONE_BG[item.tone]}`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base">{item.label}</p>
                <p className="text-xs text-text-secondary">{item.desc}</p>
              </div>
              {item.available && (
                <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
              )}
            </>
          );
          return item.available && item.to ? (
            <li key={item.label}>
              <Link
                to={item.to}
                className="hover-lift flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface p-3 transition-colors hover:bg-bg-elevated"
              >
                {inner}
              </Link>
            </li>
          ) : (
            <li
              key={item.label}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface p-3 opacity-60"
            >
              {inner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
