import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAppStore } from '../store/appStore';
import { isRemote } from './config';
import { useRemoteMeta } from './meta';
import { syncNow } from './sync';

const EVERY_MS = 60_000;

/**
 * Keeps the outbox draining while the app runs in remote mode: at start,
 * whenever connectivity returns, when the app comes to the foreground, and
 * once a minute. Edits themselves trigger a sync as they are queued.
 */
export function useRemoteSync() {
  const authenticated = useAppStore((s) => s.session.authenticated);

  useEffect(() => {
    if (!isRemote() || !authenticated) return;
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
    };
  }, [authenticated]);
}
