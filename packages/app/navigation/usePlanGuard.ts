import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { hasModule, moduleForPath } from '@esmart/core/domain/plan';
import { usePlan } from '../store/selectors';

/**
 * Keeps a Sales-plan company out of full-plan screens however it got there.
 * Entry points are hidden too; this catches deep links and anything missed.
 */
export function usePlanGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const plan = usePlan();

  useEffect(() => {
    const module = moduleForPath(pathname);
    if (module && !hasModule(plan, module)) {
      router.replace({ pathname: '/(app)/upgrade', params: { module } });
    }
  }, [pathname, plan, router]);
}
