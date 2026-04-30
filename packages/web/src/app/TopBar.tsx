import { Link } from 'react-router-dom';
import { useSyncStatus } from '@/sync/useSyncStatus';
import { cn } from '@/lib/cn';

export function TopBar() {
  const status = useSyncStatus();
  const dotLabel = describeStatus(status);

  return (
    <header className="sticky top-0 z-10 border-b border-paper-300 bg-paper-100/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-md items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-base">Peptide Tracker</span>
          <span className="text-xs text-ink-100">household</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            aria-label={`Sync status: ${dotLabel}`}
            title={dotLabel}
            className="flex items-center gap-1.5 text-xs text-ink-100"
          >
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                statusDotClass(status),
                status.outboxDepth > 0 && 'animate-pulse',
              )}
            />
            {status.outboxDepth > 0 && <span className="num">{status.outboxDepth}</span>}
          </Link>
          <button
            type="button"
            aria-label="Switch user"
            className="rounded-full bg-paper-200 px-3 py-1.5 text-xs text-ink-200 transition-colors duration-120 hover:bg-paper-300"
          >
            Alex
          </button>
        </div>
      </div>
    </header>
  );
}

function statusDotClass(status: ReturnType<typeof useSyncStatus>): string {
  if (!status.configured) return 'bg-ink-50';
  if (!status.online) return 'bg-warn';
  if (status.outboxDepth > 0) return 'bg-warn';
  return 'bg-success';
}

function describeStatus(status: ReturnType<typeof useSyncStatus>): string {
  if (!status.configured) return 'Sync not configured';
  if (!status.online) return 'Offline';
  if (status.outboxDepth > 0) return `${status.outboxDepth} pending`;
  return 'Synced';
}
