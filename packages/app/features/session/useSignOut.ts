import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/appStore';
import { useOnboardingStore } from '../../store/onboardingStore';

/** Ends the session and returns to the start of the sign-in flow. */
export function useSignOut() {
  const router = useRouter();
  const signOut = useAppStore((s) => s.signOut);
  return useCallback(() => {
    signOut();
    // A half-filled business setup belongs to the account that left.
    useOnboardingStore.getState().reset();
    router.replace('/(auth)/welcome');
  }, [router, signOut]);
}
