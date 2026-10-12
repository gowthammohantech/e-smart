import { useCallback } from 'react';
import { useRouter } from 'expo-router';

/**
 * Back to the previous screen, or to `fallback` when there is none — a web
 * page opened by URL or refreshed has no history, and `router.back()` then
 * throws. With history (always, in the native apps) it is plain `back()`.
 */
export function useGoBack() {
  const router = useRouter();
  return useCallback(
    (fallback: string) => {
      if (router.canGoBack()) router.back();
      else router.replace(fallback as never);
    },
    [router],
  );
}
