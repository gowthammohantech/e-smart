import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAppStore } from '../store/appStore';
import { useRemoteMeta } from './meta';
import { refreshNow, watchActiveCompany } from './refresh';

/** Often enough that setup another device changed shows up here without a reload. */
const EVERY_MS = 5 * 60_000;

/**
 * Keeps the open business's setup current while the app runs: when the connection returns, when the
 * app comes to the foreground, on switching business, and every few minutes. Screens read the rest
 * from the server as they open.
 */
export function useRemoteSync() {
  const authenticated = useAppStore((s) => s.session.authenticated);

  useEffect(() => {
    if (!authenticated) return;
    watchActiveCompany();
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      // Only "connected" counts: reachability probes a third-party URL that
      // some networks block, and our own requests are the real test.
      const online = state.isConnected !== false;
      const was = useRemoteMeta.getState().online;
      useRemoteMeta.getState().patch({ online });
      if (online && !was) void refreshNow();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshNow();
    });
    const timer = setInterval(() => void refreshNow(), EVERY_MS);
    return () => {
      unsubscribeNet();
      app.remove();
      clearInterval(timer);
    };
  }, [authenticated]);
}
