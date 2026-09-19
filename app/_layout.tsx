import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { ToastProvider } from '@/components/Toast';
import { I18nProvider } from '@/i18n/I18nProvider';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/uiStore';

function RootNavigator() {
  const t = useTheme();
  const router = useRouter();
  const segments = useSegments();

  // Both stores gate the first paint: the data store decides which route the
  // person belongs on, the UI store decides the theme and the language.
  const dataHydrated = useAppStore((s) => s.hydrated);
  const uiHydrated = useUiStore((s) => s.hydrated);
  const hydrated = dataHydrated && uiHydrated;
  const authenticated = useAppStore((s) => s.session.authenticated);
  const onboardingComplete = useAppStore((s) => s.session.onboardingComplete);

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
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // The persisted store rehydrates asynchronously; when nothing was stored
    // yet the callback never fires, so flip the flag once on mount.
    const timer = setTimeout(() => {
      if (!useAppStore.getState().hydrated) useAppStore.getState().setHydrated(true);
      if (!useUiStore.getState().hydrated) useUiStore.getState().setHydrated(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Outermost, because the theme derives its script metrics from the
            active language and the toast renders translated text. */}
        <I18nProvider>
          <ThemeProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
