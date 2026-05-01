import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { getDb, type CalendarFeedSettings, type UserProfile } from '@/db';
import type { CalendarPrivacyT } from '@peptide/domain';
import { useActive } from '@/app/useActive';
import { listUsersInHousehold } from '@/app/active-household';
import {
  getOrCreateHouseholdFeed,
  getOrCreateUserFeed,
  rotateFeedToken,
  revokeFeedToken,
  updateFeed,
} from './feedSettings';
import { buildLocalIcs, downloadIcs } from './exportIcs';

interface Props {
  /** Worker URL from the parent Sync section — used to render hosted-feed URLs. */
  workerUrl: string;
}

export function CalendarSettings({ workerUrl }: Props) {
  const active = useActive();
  const db = getDb();

  const users = useLiveQuery(
    async () => (active.householdId ? await listUsersInHousehold(db, active.householdId) : []),
    [active.householdId],
    [],
  );

  const feeds = useLiveQuery(
    async () => {
      if (!active.householdId) return [];
      return db.calendarFeedSettings
        .where('householdId')
        .equals(active.householdId)
        .toArray();
    },
    [active.householdId],
    [],
  );

  // Lazily create the household-scope row + a user-scope row for each user.
  useEffect(() => {
    if (!active.householdId || !users) return;
    void (async () => {
      await getOrCreateHouseholdFeed(db, active.householdId!);
      for (const u of users) {
        await getOrCreateUserFeed(db, active.householdId!, u.id);
      }
    })();
  }, [active.householdId, users, db]);

  const householdFeed = (feeds ?? []).find((f) => f.scope === 'household');
  const userFeeds = (feeds ?? []).filter((f) => f.scope === 'user');

  if (!active.householdId) return null;

  return (
    <div className="rounded-md border border-paper-300 p-4 space-y-3">
      <header className="space-y-1">
        <h2 className="text-base">Calendar feed</h2>
        <p className="text-sm text-ink-100">
          Subscribe Apple, Google, or Outlook calendars to upcoming doses. The hosted feed needs a
          Worker URL configured above. The download button always works locally.
        </p>
      </header>

      {householdFeed && (
        <FeedRow
          feed={householdFeed}
          label="Whole household"
          users={users ?? []}
          workerUrl={workerUrl}
        />
      )}
      {userFeeds.map((f) => {
        const u = (users ?? []).find((x) => x.id === f.userId);
        return (
          <FeedRow
            key={f.id}
            feed={f}
            label={u?.displayName ?? 'User'}
            users={users ?? []}
            workerUrl={workerUrl}
          />
        );
      })}

      <p className="text-xs text-ink-100">
        Calendar feeds publish only what the privacy mode allows. Default is "generic" — your
        calendar shows "Scheduled dose — Alex" with no product name.
      </p>
    </div>
  );
}

function FeedRow({
  feed,
  label,
  users,
  workerUrl,
}: {
  feed: CalendarFeedSettings;
  label: string;
  users: UserProfile[];
  workerUrl: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostedUrl = useMemo(() => {
    if (!workerUrl.trim() || !feed.feedToken) return null;
    const base = workerUrl.replace(/\/+$/, '');
    if (feed.scope === 'user') {
      return `${base}/feed/user/${feed.userId}.ics?token=${encodeURIComponent(feed.feedToken)}`;
    }
    return `${base}/feed/household/${feed.householdId}.ics?token=${encodeURIComponent(feed.feedToken)}`;
  }, [workerUrl, feed]);

  async function setEnabled(v: boolean) {
    setBusy(true);
    setError(null);
    try {
      await updateFeed(getDb(), { id: feed.id, enabled: v });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function setPrivacy(v: CalendarPrivacyT) {
    setBusy(true);
    try {
      await updateFeed(getDb(), { id: feed.id, privacy: v });
    } finally {
      setBusy(false);
    }
  }

  async function setFlag(key: keyof CalendarFeedSettings, v: boolean) {
    setBusy(true);
    try {
      await updateFeed(getDb(), { id: feed.id, [key]: v });
    } finally {
      setBusy(false);
    }
  }

  async function setReminders(raw: string) {
    const trimmed = raw.trim();
    const minutes = trimmed
      ? trimmed
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n >= 0 && n < 24 * 60)
      : [];
    setBusy(true);
    try {
      await updateFeed(getDb(), {
        id: feed.id,
        ...(minutes.length > 0 ? { reminderMinutesBefore: minutes } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setBusy(true);
    try {
      await rotateFeedToken(getDb(), feed.id);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm('Revoke the current token? Subscribers will see 404 until you rotate.')) {
      return;
    }
    setBusy(true);
    try {
      await revokeFeedToken(getDb(), feed.id);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const ics = await buildLocalIcs({
        db: getDb(),
        householdId: feed.householdId,
        feed,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const slug =
        feed.scope === 'user' ? users.find((u) => u.id === feed.userId)?.displayName ?? 'user' : 'household';
      downloadIcs(`peptide-tracker-${slug.toLowerCase()}-${stamp}.ics`, ics);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyHostedUrl() {
    if (!hostedUrl) return;
    try {
      await navigator.clipboard.writeText(hostedUrl);
    } catch {
      // ignore — fall through, user can select-and-copy from the input
    }
  }

  return (
    <div className="rounded-md border border-paper-300 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-ink-100">
            Scope: {feed.scope}
            {feed.feedTokenIssuedAt
              ? ` · token issued ${formatRelative(feed.feedTokenIssuedAt)}`
              : feed.feedToken
                ? ' · token issued'
                : ''}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={feed.enabled}
            onChange={(e) => void setEnabled(e.target.checked)}
            disabled={busy}
          />
          Enabled
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="block font-medium">Privacy</legend>
        <div className="mt-1 flex gap-1">
          {(['minimal', 'generic', 'full'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void setPrivacy(p)}
              aria-pressed={feed.privacy === p}
              className={
                feed.privacy === p
                  ? 'rounded-full bg-ink-300 px-3 py-1.5 text-xs text-paper-100'
                  : 'rounded-full bg-paper-200 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-300'
              }
            >
              {p}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-1 text-xs">
        <FlagToggle
          label="Include dose"
          checked={feed.includeDose}
          onChange={(v) => void setFlag('includeDose', v)}
          disabled={busy || feed.privacy !== 'full'}
        />
        <FlagToggle
          label="Include product name"
          checked={feed.includeProductName}
          onChange={(v) => void setFlag('includeProductName', v)}
          disabled={busy || feed.privacy !== 'full'}
        />
        <FlagToggle
          label="Include protocol name"
          checked={feed.includeProtocolName}
          onChange={(v) => void setFlag('includeProtocolName', v)}
          disabled={busy || feed.privacy !== 'full'}
        />
        <FlagToggle
          label="Include reminders"
          checked={feed.includeReminders}
          onChange={(v) => void setFlag('includeReminders', v)}
          disabled={busy}
        />
      </fieldset>

      {feed.includeReminders && (
        <label className="block text-xs">
          <span className="block font-medium">Reminders (minutes before, comma-separated)</span>
          <input
            inputMode="numeric"
            placeholder="10, 60"
            defaultValue={(feed.reminderMinutesBefore ?? []).join(', ')}
            onBlur={(e) => void setReminders(e.target.value)}
            className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-2 py-1 font-mono"
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download .ics
        </button>
        <button
          type="button"
          onClick={() => void rotate()}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-paper-300 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {feed.feedToken ? 'Rotate token' : 'Issue token'}
        </button>
        {feed.feedToken && (
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={busy}
            className="flex items-center gap-1 rounded-md border border-paper-300 px-3 py-1.5 text-xs text-ink-200 hover:bg-paper-200 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Revoke
          </button>
        )}
      </div>

      {hostedUrl ? (
        <div className="rounded-md border border-paper-300 bg-paper-50 px-2 py-1.5 text-xs">
          <p className="text-ink-100">Hosted feed URL</p>
          <p className="mt-1 break-all font-mono">{hostedUrl}</p>
          <button
            type="button"
            onClick={() => void copyHostedUrl()}
            className="mt-1 rounded-sm bg-paper-200 px-2 py-0.5 text-[11px] text-ink-200 hover:bg-paper-300"
          >
            Copy URL
          </button>
        </div>
      ) : workerUrl.trim() && feed.feedToken ? null : (
        <p className="text-xs text-ink-100">
          {!workerUrl.trim()
            ? 'Set the Worker URL above to enable a hosted feed URL.'
            : 'Issue a token to enable the hosted feed URL.'}
        </p>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function FlagToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? 'text-ink-100/60' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
