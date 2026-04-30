import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ResultTileProps {
  primary: ReactNode;
  primaryUnit: string;
  secondary?: ReactNode;
  secondaryUnit?: string;
  hint?: ReactNode;
  className?: string;
}

/**
 * Lab-notebook Big Result Tile. Mono numerics, paper-toned card, no shadows.
 */
export function ResultTile({
  primary,
  primaryUnit,
  secondary,
  secondaryUnit,
  hint,
  className,
}: ResultTileProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-paper-300 bg-paper-50 px-4 py-5 text-center',
        className,
      )}
      data-testid="result-tile"
    >
      <p className="font-display text-3xl">
        <span className="num" data-numeric="primary">
          {primary}
        </span>
        <span className="ml-1.5 text-base text-ink-100">{primaryUnit}</span>
      </p>
      {secondary !== undefined && (
        <p className="mt-1 text-sm text-ink-100">
          <span className="num" data-numeric="secondary">
            {secondary}
          </span>{' '}
          <span>{secondaryUnit}</span>
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-ink-100">{hint}</p>}
    </div>
  );
}

interface ShowYourWorkProps {
  formula?: string;
  rows?: ReadonlyArray<{ label: string; value: ReactNode }>;
  warnings?: ReadonlyArray<{ code: string; message: string }>;
  error?: string | null;
}

export function ShowYourWork({ formula, rows, warnings, error }: ShowYourWorkProps) {
  return (
    <section
      aria-label="Show your work"
      className="rounded-md border border-paper-300 bg-paper-50 p-3 text-sm"
    >
      <h4 className="text-xs font-medium uppercase tracking-wide text-ink-100">Show your work</h4>
      {error ? (
        <p className="mt-1 text-xs text-warn">{error}</p>
      ) : (
        <>
          {formula && <p className="mt-1 font-mono text-sm">{formula}</p>}
          {rows && rows.length > 0 && (
            <dl className="mt-2 space-y-1 text-xs">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-2">
                  <dt className="text-ink-100">{r.label}</dt>
                  <dd className="num text-ink-200">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
      {warnings && warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {warnings.map((w) => (
            <li
              key={w.code}
              className="rounded-sm border-l-2 border-warn bg-paper-100 px-2 py-1 text-warn"
              data-testid={`warning-${w.code}`}
            >
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
