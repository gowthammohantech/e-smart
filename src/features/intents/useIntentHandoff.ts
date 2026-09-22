import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { addPendingActionListener, consumePendingAction } from './bridge';

/**
 * Picks up what a Siri or Shortcuts intent left behind and opens the screen
 * that finishes it. Checked on mount (cold start), on the native event (app
 * already running) and on returning to the foreground (anything missed).
 */
export function useIntentHandoff() {
  const router = useRouter();

  useEffect(() => {
    const handle = () => {
      const action = consumePendingAction();
      if (!action) return;
      router.push({
        pathname: '/(app)/sales/invoices/new',
        params: {
          partyId: action.partyId,
          quantity: String(action.quantity),
          ...(action.itemId ? { itemId: action.itemId } : {}),
        },
      });
    };

    handle();
    const event = addPendingActionListener(handle);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') handle();
    });
    return () => {
      event.remove();
      appState.remove();
    };
  }, [router]);
}
