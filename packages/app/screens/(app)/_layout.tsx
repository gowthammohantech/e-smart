import React from 'react';
import { SwitchingOverlay } from '../../components/SwitchingOverlay';
import { Stack, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { ErrorFallback } from '../../components/ErrorFallback';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useAppStore } from '../../store/appStore';
import { usePlanGuard } from '../../navigation/usePlanGuard';
import { useIntentEntitySync } from '../../features/intents/useIntentEntitySync';
import { useIntentHandoff } from '../../features/intents/useIntentHandoff';
import { PageSurface } from '@esmart/ui/components/Doodles';
import { hubBackOptions } from '../../navigation/HubBackButton';

/** A crash inside the signed-in app keeps the way home. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  const router = useRouter();
  return <ErrorFallback {...props} home={() => router.replace('/(app)/(tabs)')} />;
}

export default function AppLayout() {
  // "/" resolves here, so every launch lands in this group before the root
  // layout's redirect runs: without a session, Home must not render meanwhile.
  const authenticated = useAppStore((s) => s.session.authenticated);
  const onboardingComplete = useAppStore((s) => s.session.onboardingComplete);
  if (!authenticated || !onboardingComplete) return null;
  return <AppStack />;
}

function AppStack() {
  const t = useTheme();
  usePlanGuard();
  // Siri / Shortcuts: only mounted once signed in, onboarded and hydrated.
  useIntentEntitySync();
  useIntentHandoff();
  return (
    <>
    <Stack
      screenLayout={({ children, route }) =>
        // The tabs draw a surface per tab themselves.
        route.name === '(tabs)' ? children : <PageSurface>{children}</PageSurface>
      }
      screenOptions={({ route, navigation }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: t.c.bg },
        headerTintColor: t.c.text,
        headerTitleStyle: { color: t.c.text, fontSize: t.fontSize.title, fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.c.bg },
        animation: 'slide_from_right',
        // Opened by a link or a notification with nothing beneath it: back goes to its list or hub.
        ...hubBackOptions(route, navigation),
      })}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="lixi"
        options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
    </Stack>
    <SwitchingOverlay />
    </>
  );
}
