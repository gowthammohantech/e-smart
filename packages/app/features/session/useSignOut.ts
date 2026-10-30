import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../store/appStore';
import { useOnboardingStore } from '../../store/onboardingStore';

/** Ends the session and returns to the start of the sign-in flow. */
export function useSignOut() {
  const router = useRouter();
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  const signOut = useAppStore((s) => s.signOut);
  return useCallback(() => {
    const { session, users } = useAppStore.getState();
    const email = users.find((u) => u.id === session.userId)?.email;
    signOut();
    // A half-filled business setup belongs to the account that left.
    useOnboardingStore.getState().reset();
    router.replace('/(auth)/welcome');
    toast.show(tr('common:toast.signedOut'), 'info', { icon: 'logout', detail: email });
  }, [router, signOut, toast, tr]);
}
