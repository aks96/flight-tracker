import { useEffect, useRef, useState } from 'react';

/**
 * Runs `callback` immediately and then on a fixed interval for as long as
 * the calling component is mounted — screens previously fetched once on
 * mount and never again, so prices/status only ever updated on a manual
 * pull-to-refresh. Also tracks a live "synced Ns ago" counter for a visible
 * refresh indicator.
 */
export function useAutoRefresh(callback: () => Promise<void> | void, intervalMs: number) {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await callbackRef.current();
      if (!cancelled) setLastSyncedAt(new Date());
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (lastSyncedAt) setSecondsAgo(Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastSyncedAt]);

  return { lastSyncedAt, secondsAgo, refreshNow: () => callbackRef.current() };
}
