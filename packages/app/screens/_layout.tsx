import React, { useEffect } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Illustration } from '@esmart/ui/components/Illustration';
import { PageBackdrop } from '@esmart/ui/components/PageBackdrop';
import { AppThemeProvider } from '../providers/AppThemeProvider';
import { ToastProvider } from '@esmart/ui/components/Toast';
import { I18nProvider } from '../i18n/I18nProvider';
import { useAppStore } from '../store/appStore';
import { useUiStore } from '../store/uiStore';
import { API_CONFIGURED, installRemote, useRemoteSync } from '../remote';
import { startUp, useStartup } from '../remote/session';
import { Button } from '@esmart/ui/components/Button';
import { queryClient, useQueryStoreWatch } from '../remote/queries';
import { i18nInstance as i18n } from '@esmart/i18n';
import { ErrorFallback, FallbackArt } from '../components/ErrorFallback';
import { SaveToasts } from '../components/SaveToasts';
import { installGlobalErrorHandlers } from '../lib/reporter';
import { usePushNotifications } from '../features/session/usePushNotifications';
import { MfaGate } from '../features/security/MfaGate';
import { UpdateGate } from '../features/session/UpdateGate';

// The store's actions are wrapped once, before anything renders; then the session (if any) loads.
installRemote();
installGlobalErrorHandlers();
if (API_CONFIGURED) void startUp();

/** A crash anywhere below the root shows this instead of a blank screen. */
export { ErrorFallback as ErrorBoundary };

/** Pages opened from an emailed link: they work whether or not someone is signed in. */
const LINK_PAGES = ['accept-invite', 'reset-password'] as const;

function RootNavigator() {
  const t = useTheme();
  useRemoteSync();
  useQueryStoreWatch();
  const router = useRouter();
  const segments = useSegments();

  // Both gate the first paint: the session (loaded from the server) decides which
  // route the person belongs on, the UI store decides the theme and the language.
  const dataHydrated = useAppStore((s) => s.hydrated);
  const uiHydrated = useUiStore((s) => s.hydrated);
  const hydrated = dataHydrated && uiHydrated;
  const startup = useStartup((s) => s.state);
  const authenticated = useAppStore((s) => s.session.authenticated);
  const onboardingComplete = useAppStore((s) => s.session.onboardingComplete);
  usePushNotifications(hydrated && authenticated && onboardingComplete);

  useEffect(() => {
    if (!hydrated) return;
    const group = segments[0];
    // An invitation or a password-reset link is for whoever opens it, signed in or not.
    const linkPage = group === '(auth)' && (LINK_PAGES as readonly string[]).includes(String((segments as string[])[1] ?? ''));

    if (!authenticated && group !== '(auth)') {
      router.replace('/(auth)/welcome');
      return;
    }
    if (authenticated && linkPage) return;
    if (authenticated && !onboardingComplete && group !== '(onboarding)') {
      router.replace('/(onboarding)/tax');
      return;
    }
    if (authenticated && onboardingComplete && (group === '(auth)' || group === '(onboarding)')) {
      router.replace('/(app)/(tabs)');
    }
  }, [hydrated, authenticated, onboardingComplete, segments, router]);

  if (!hydrated && startup === 'offline') return <StartOffline />;
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar">
        <PageBackdrop />
        <Illustration name="loading" size="full" />
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
      <MfaGate />
      <UpdateGate />
    </>
  );
}

/** Opened with a session but no connection: the books are on the server, so wait for it. */
function StartOffline() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl, gap: t.spacing.lg }}>
      <PageBackdrop />
      <Illustration name="offline" size="full" />
      <Text style={{ fontSize: 18, fontWeight: '700', color: t.c.text, textAlign: 'center' }}>{i18n.t('common:network.offlineTitle')}</Text>
      <Text style={{ fontSize: 15, color: t.c.muted, textAlign: 'center', maxWidth: 360, lineHeight: 21 }}>{i18n.t('common:network.offlineBody')}</Text>
      <Button title={i18n.t('common:network.retry')} icon="refresh" onPress={() => void startUp()} />
    </View>
  );
}

/** A release build made without its API address: say so, rather than fail every request against localhost. */
function Misconfigured() {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: dark ? '#000000' : '#F2F2F7' }}>
      <FallbackArt name="offline" dark={dark} />
      <Text style={{ fontSize: 16, textAlign: 'center', maxWidth: 360, lineHeight: 22, color: dark ? '#F2F2F7' : '#1C1C1E' }}>
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
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          {/* Outermost, because the theme derives its script metrics from the
              active language and the toast renders translated text. */}
          <I18nProvider>
            <AppThemeProvider>
              <ToastProvider>
                <RootNavigator />
                <SaveToasts />
              </ToastProvider>
            </AppThemeProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
