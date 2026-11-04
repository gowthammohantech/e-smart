import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppThemeProvider } from '../providers/AppThemeProvider';
import { ToastProvider } from '@esmart/ui/components/Toast';
import { I18nProvider } from '../i18n/I18nProvider';
import { useAppStore } from '../store/appStore';
import { useUiStore } from '../store/uiStore';
import { API_CONFIGURED, installRemote, useRemoteSync } from '../remote';
import { i18nInstance as i18n } from '@esmart/i18n';
import { ErrorFallback } from '../components/ErrorFallback';
import { OfflinePrompt } from '../components/OfflinePrompt';
import { installGlobalErrorHandlers } from '../lib/reporter';
import { usePushNotifications } from '../features/session/usePushNotifications';

// Remote mode wraps the store's actions once, before anything renders.
installRemote();
installGlobalErrorHandlers();

/** A crash anywhere below the root shows this instead of a blank screen. */
export { ErrorFallback as ErrorBoundary };

function RootNavigator() {
  const t = useTheme();
  useRemoteSync();
  const router = useRouter();
  const segments = useSegments();

  // Both stores gate the first paint: the data store decides which route the
  // person belongs on, the UI store decides the theme and the language.
  const dataHydrated = useAppStore((s) => s.hydrated);
  const uiHydrated = useUiStore((s) => s.hydrated);
  const hydrated = dataHydrated && uiHydrated;
  const authenticated = useAppStore((s) => s.session.authenticated);
  const onboardingComplete = useAppStore((s) => s.session.onboardingComplete);
  usePushNotifications(hydrated && authenticated && onboardingComplete);

  useEffect(() => {
    if (!hydrated) return;
    const group = segments[0];

    if (!authenticated && group !== '(auth)') {
      router.replace('/(auth)/welcome');
      return;
    }
    if (authenticated && !onboardingComplete && group !== '(onboarding)') {
      router.replace('/(onboarding)/business');
      return;
    }
    if (authenticated && onboardingComplete && (group === '(auth)' || group === '(onboarding)')) {
      router.replace('/(app)/(tabs)');
    }
  }, [hydrated, authenticated, onboardingComplete, segments, router]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.c.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.c.bg },
          // Only the route guard moves between these groups, including at launch;
          // sliding would show the redirect. Each group animates its own screens.
          animation: 'none',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

/** A release build made without its API address: say so, rather than fail every request against localhost. */
function Misconfigured() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 16, textAlign: 'center', maxWidth: 360, lineHeight: 22 }}>
        {i18n.t('common:crash.misconfigured', { defaultValue: "This build of the app doesn't know where its server is. Please update the app, or contact support." })}
      </Text>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Preferences only. The book reports its own hydration: flagging it early
    // would save the still-empty store over what's on disk.
    const timer = setTimeout(() => {
      if (!useUiStore.getState().hydrated) useUiStore.getState().setHydrated(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  if (!API_CONFIGURED) return <Misconfigured />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Outermost, because the theme derives its script metrics from the
            active language and the toast renders translated text. */}
        <I18nProvider>
          <AppThemeProvider>
            <ToastProvider>
              <RootNavigator />
              <OfflinePrompt />
            </ToastProvider>
          </AppThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
