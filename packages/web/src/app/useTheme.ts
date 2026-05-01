// Theme toggle. Persists to the meta table so the choice syncs across
// devices once Cloudflare is wired. Defaults to dark.

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb, nowIso } from '@/db';

export type Theme = 'dark' | 'light';
const KEY = 'app.theme.v1';

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const db = getDb();
  const persisted = useLiveQuery(
    async () => {
      const row = await db.meta.get(KEY);
      const v = row?.value;
      return v === 'light' ? 'light' : 'dark';
    },
    [],
    'dark' as Theme,
  );

  const [theme, setLocal] = useState<Theme>('dark');

  useEffect(() => {
    setLocal(persisted ?? 'dark');
  }, [persisted]);

  // Keep the <html> class in sync.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.classList.add('light');
    else root.classList.remove('light');
  }, [theme]);

  function setTheme(next: Theme): void {
    setLocal(next);
    void db.meta.put({ key: KEY, value: next, updatedAt: nowIso() });
  }

  return { theme, setTheme };
}
