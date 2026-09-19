import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { hasModule, moduleForPath } from '@/domain/plan';
import { usePlan } from '@/store/selectors';

/**
 * Keeps a Sales-plan company out of full-plan screens however it got there.
 * Entry points are hidden too; this catches deep links and anything missed.
 */
function usePlanGuard() {
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

export default function AppLayout() {
  const t = useTheme();
  usePlanGuard();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: t.c.bg },
        headerTintColor: t.c.text,
        headerTitleStyle: { color: t.c.text, fontSize: t.fontSize.title, fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.c.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="lixi"
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
