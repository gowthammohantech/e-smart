import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { hasModule, moduleEnabled, moduleForPath, switchedModuleForPath } from '@esmart/core/domain/plan';
import { useDisabledModules, usePlan } from '../store/selectors';

/**
 * Keeps a Sales-plan company out of full-plan screens however it got there.
 * Entry points are hidden too; this catches deep links and anything missed.
 */
export function usePlanGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const plan = usePlan();
  const disabled = useDisabledModules();

  useEffect(() => {
    const module = moduleForPath(pathname);
    const switched = switchedModuleForPath(pathname);
    if (module && !hasModule(plan, module)) {
      router.replace({ pathname: '/(app)/upgrade', params: { module } });
    } else if ((module && !moduleEnabled(plan, disabled, module)) || (switched && disabled.includes(switched))) {
      // In the plan, but switched off (or a settings page of a module switched off): where it can be switched on.
      router.replace('/(app)/settings/modules');
    }
  }, [pathname, plan, disabled, router]);
}
