import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { UserProfile } from '@/db';
import { getDb, newId, nowIso } from '@/db';
import { UserProfileRepo } from '@/db';
import { writeActive } from './active-household';
import { Modal } from '@/components/Modal';

const PRESET_COLORS = ['#1C1A17', '#2E5E3E', '#B26A00', '#9B2C2C', '#5C5851', '#3B5BA9', '#7C3F8E'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: string | null;
  activeUserId: string | null;
  users: UserProfile[];
}

export function UserManagementModal({
  open,
  onOpenChange,
  householdId,
  activeUserId,
  users,
}: Props) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Household members"
      description="Each user gets their own logs and protocols. Inventory is shared."
    >
      {householdId ? (
        <UserList householdId={householdId} activeUserId={activeUserId} users={users} />
      ) : (
        <p className="text-sm text-ink-100">Set up a household first.</p>
      )}
    </Modal>
  );
}

function UserList({
  householdId,
  activeUserId,
  users,
}: {
  householdId: string;
  activeUserId: string | null;
  users: UserProfile[];
}) {
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <ul className="ruled-y rounded-md border border-paper-300">
        {users.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-100">No users yet.</li>
        )}
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: u.color }}
            />
            <span className="flex-1">
              {u.displayName}
              {u.id === activeUserId && (
                <span className="ml-2 text-xs text-ink-100">(active)</span>
              )}
            </span>
            <button
              type="button"
              aria-label={`Edit ${u.displayName}`}
              onClick={() => setEditing(u)}
              className="rounded-md p-1 text-ink-100 hover:bg-paper-200"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <DeleteButton
              user={u}
              isActive={u.id === activeUserId}
              isLast={users.length <= 1}
              householdId={householdId}
              users={users}
            />
          </li>
        ))}
      </ul>

      {!adding && !editing && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="touch-lg w-full rounded-md border border-paper-300 px-3 py-2 text-sm hover:bg-paper-200"
        >
          + Add another user
        </button>
      )}

      {adding && (
        <UserForm
          householdId={householdId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}
      {editing && (
        <UserForm
          householdId={householdId}
          existing={editing}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DeleteButton({
  user,
  isActive,
  isLast,
  householdId,
  users,
}: {
  user: UserProfile;
  isActive: boolean;
  isLast: boolean;
  householdId: string;
  users: UserProfile[];
}) {
  const disabled = isLast;
  async function onDelete() {
    if (disabled) return;
    if (
      !window.confirm(
        `Delete user "${user.displayName}"? Their dose logs and protocols will be hidden but kept on disk.`,
      )
    ) {
      return;
    }
    const db = getDb();
    const repo = new UserProfileRepo(db);
    await repo.softDelete(user.id);
    if (isActive) {
      const next = users.find((u) => u.id !== user.id && !u.deletedAt);
      if (next) await writeActive(db, { householdId, userId: next.id });
    }
  }
  return (
    <button
      type="button"
      aria-label={`Delete ${user.displayName}`}
      onClick={() => void onDelete()}
      disabled={disabled}
      title={disabled ? 'Cannot delete the last user.' : 'Delete user'}
      className="rounded-md p-1 text-ink-100 hover:bg-paper-200 disabled:opacity-30"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function UserForm({
  householdId,
  existing,
  onDone,
  onCancel,
}: {
  householdId: string;
  existing?: UserProfile;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.displayName ?? '');
  const [color, setColor] = useState(existing?.color ?? PRESET_COLORS[0]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Display name is required.');
      return;
    }
    setBusy(true);
    try {
      const db = getDb();
      const repo = new UserProfileRepo(db);
      if (existing) {
        await repo.upsert({
          ...existing,
          displayName: name.trim(),
          color,
        });
      } else {
        const now = nowIso();
        await repo.upsert({
          id: newId(),
          householdId,
          displayName: name.trim(),
          color,
          createdAt: now,
          updatedAt: now,
          version: 0,
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-paper-300 p-3">
      <h3 className="text-sm font-medium">{existing ? 'Edit user' : 'Add user'}</h3>
      <label className="block text-sm">
        <span className="block font-medium">Display name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="e.g. partner, kid, you"
          className="mt-1 w-full rounded-md border border-paper-300 bg-paper-50 px-3 py-2 text-sm"
        />
      </label>
      <fieldset className="text-sm">
        <legend className="block font-medium">Color</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-ink-300' : 'border-paper-300'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-ink-100 hover:bg-paper-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ink-300 px-3 py-1.5 text-sm text-paper-100 hover:bg-ink-200 disabled:opacity-50"
        >
          {busy ? 'Saving…' : existing ? 'Save' : 'Add user'}
        </button>
      </div>
    </form>
  );
}
