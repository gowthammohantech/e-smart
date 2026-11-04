import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAppStore } from '../store/appStore';
import { startConnectivity, stopConnectivity } from './connectivity';
import { useRemoteMeta } from './meta';
import { syncNow } from './sync';

/** Often enough that what another device saved shows up here without a reload. */
const EVERY_MS = 20_000;

/**
 * Keeps the book in step with the server while the app runs: at start,
 * whenever connectivity returns, when the app comes to the foreground, and
 * every 20 seconds. Edits themselves trigger a sync as they are queued.
 * Connectivity (connectivity.ts) decides whether edits wait for the server
 * or, with the person's agreement, are kept here.
 */
export function useRemoteSync() {
  const authenticated = useAppStore((s) => s.session.authenticated);

  useEffect(() => {
    if (!authenticated) return;
    startConnectivity({ drain: syncNow });
    void syncNow();

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      // Only "connected" counts: reachability probes a third-party URL that
      // some networks block, and our own requests are the real test.
      const online = state.isConnected !== false;
      const was = useRemoteMeta.getState().online;
      useRemoteMeta.getState().patch({ online });
      if (online && !was) void syncNow();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    const timer = setInterval(() => void syncNow(), EVERY_MS);
    return () => {
      unsubscribeNet();
      app.remove();
      clearInterval(timer);
      stopConnectivity();
    };
  }, [authenticated]);
}
