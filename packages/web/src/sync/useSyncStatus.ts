import { useEffect, useState } from 'react';
import { getDb } from '@/db';
import { getEngine, type SyncStatus } from './engine.js';

let started = false;

/**
 * Subscribes to the SyncEngine. Lazily starts the engine on first mount;
 * subsequent mounts reuse the same singleton.
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getEngine(getDb()).getStatus());

  useEffect(() => {
    const engine = getEngine(getDb());
    if (!started) {
      started = true;
      void engine.start();
    }
    setStatus(engine.getStatus());
    return engine.onChange((s) => setStatus(s));
  }, []);

  return status;
}
