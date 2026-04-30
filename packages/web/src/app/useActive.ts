import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/db';
import { readActive, type ActiveContext } from './active-household';

export interface ActiveResolved extends ActiveContext {
  /** Convenience: true once both ids are non-null. */
  ready: boolean;
  /** True until the first read returns. */
  loading: boolean;
}

/**
 * Live-subscribe to the active household / user. Updates immediately when
 * either meta key changes (e.g., after the bootstrap form completes).
 */
export function useActive(): ActiveResolved {
  const db = getDb();
  const value = useLiveQuery(() => readActive(db), [], undefined);
  if (value === undefined) {
    return { householdId: null, userId: null, ready: false, loading: true };
  }
  return {
    householdId: value.householdId,
    userId: value.userId,
    ready: !!value.householdId && !!value.userId,
    loading: false,
  };
}
