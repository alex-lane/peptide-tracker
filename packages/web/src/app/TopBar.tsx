import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity } from 'lucide-react';
import { getDb } from '@/db';
import { useSyncStatus } from '@/sync/useSyncStatus';
import { useActive } from '@/app/useActive';
import { cn } from '@/lib/cn';
import { UserSwitcher } from './UserSwitcher';

export function TopBar() {
  const status = useSyncStatus();
  const active = useActive();
  const db = getDb();

  const household = useLiveQuery(
    async () => (active.householdId ? await db.households.get(active.householdId) : undefined),
    [active.householdId],
  );

  const dotLabel = describeStatus(status);

  return (
    <header className="sticky top-0 z-10 border-b border-border-subtle bg-bg-base/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-screen-md items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent-primary/15 text-accent-primary">
            <Activity className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm font-semibold tracking-tight">
              Peptide Tracker
            </span>
            <span className="text-[11px] text-text-muted">{household?.name ?? 'household'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            aria-label={`Sync status: ${dotLabel}`}
            title={dotLabel}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-elevated"
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
          <UserSwitcher />
        </div>
      </div>
    </header>
  );
}

function statusDotClass(status: ReturnType<typeof useSyncStatus>): string {
  if (!status.configured) return 'bg-text-muted';
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
