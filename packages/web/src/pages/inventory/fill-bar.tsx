import { cn } from '@/lib/cn';

interface Props {
  filled: number;
  total: number;
  className?: string;
}

/**
 * Lab-notebook-style remaining indicator: a thin ruled line that empties
 * left-to-right. No shadows, no gradients.
 */
export function FillBar({ filled, total, className }: Props) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0;
  const pct = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% remaining`}
      className={cn('relative h-1.5 w-full bg-paper-300', className)}
    >
      <div
        className={cn(
          'absolute left-0 top-0 h-full transition-all duration-240 ease-out-fast',
          ratio > 0.33 ? 'bg-ink-300' : 'bg-warn',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
