import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Settings, ChevronDown } from 'lucide-react';
import { getDb } from '@/db';
import { listUsersInHousehold, writeActive } from './active-household';
import { useActive } from './useActive';
import { UserManagementModal } from './UserManagementModal';

export function UserSwitcher() {
  const active = useActive();
  const db = getDb();
  const [managing, setManaging] = useState(false);

  const users = useLiveQuery(
    async () => (active.householdId ? await listUsersInHousehold(db, active.householdId) : []),
    [active.householdId],
    [],
  );

  const activeUser = users?.find((u) => u.id === active.userId);
  if (!active.householdId || !activeUser) return null;

  async function selectUser(userId: string) {
    if (userId === active.userId) return;
    await writeActive(db, { householdId: active.householdId, userId });
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Switch user (current: ${activeUser.displayName})`}
            className="flex items-center gap-1.5 rounded-full bg-paper-200 px-3 py-1.5 text-xs text-ink-200 transition-colors duration-120 hover:bg-paper-300"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: activeUser.color }}
            />
            {activeUser.displayName}
            <ChevronDown className="h-3 w-3 text-ink-100" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[12rem] rounded-md border border-paper-300 bg-paper-100 p-1 text-sm"
          >
            <DropdownMenu.Label className="px-2 py-1 text-xs uppercase tracking-wide text-ink-100">
              Household members
            </DropdownMenu.Label>
            {users?.map((u) => {
              const isActive = u.id === active.userId;
              return (
                <DropdownMenu.Item
                  key={u.id}
                  onSelect={() => void selectUser(u.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-paper-200"
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: u.color }}
                  />
                  <span className="flex-1">{u.displayName}</span>
                  {isActive && <Check className="h-3.5 w-3.5 text-ink-200" aria-hidden />}
                </DropdownMenu.Item>
              );
            })}
            <DropdownMenu.Separator className="my-1 h-px bg-paper-300" />
            <DropdownMenu.Item
              onSelect={() => setManaging(true)}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-paper-200"
            >
              <Plus className="h-3.5 w-3.5 text-ink-200" aria-hidden />
              <span className="flex-1">Add or edit users</span>
              <Settings className="h-3.5 w-3.5 text-ink-100" aria-hidden />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <UserManagementModal
        open={managing}
        onOpenChange={setManaging}
        householdId={active.householdId}
        activeUserId={active.userId}
        users={users ?? []}
      />
    </>
  );
}
