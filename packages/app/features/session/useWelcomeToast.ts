import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../store/appStore';

/** Greets someone once their session and data are in, by email or by a code to their phone. */
export function useWelcomeToast() {
  const { t: tr } = useTranslation(['auth']);
  const toast = useToast();
  return useCallback(() => {
    const { session, users } = useAppStore.getState();
    const me = users.find((u) => u.id === session.userId);
    toast.show(tr('auth:signIn.title'), 'success', { icon: 'hand-wave-outline', detail: me ? `${me.name} · ${me.email}` : undefined });
  }, [toast, tr]);
}
