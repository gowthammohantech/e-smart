import React, { useEffect } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { i18nInstance as i18n } from '@esmart/i18n';
import { ThemeProvider } from '@esmart/ui/theme/ThemeProvider';
import { Illustration } from '@esmart/ui/components/Illustration';
import type { IllustrationName } from '@esmart/ui/illustrations/registry';
import { reportError } from '../lib/reporter';

/** Swallows a failure in the art so the fallback it decorates always renders. */
class Quiet extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * An illustration for screens that render outside the app's theme — the crash
 * and misconfigured screens. Brings its own theme, following the system scheme.
 */
export function FallbackArt({ name, dark }: { name: IllustrationName; dark: boolean }) {
  return (
    <Quiet>
      <ThemeProvider mode={dark ? 'dark' : 'light'} script="latin">
        <Illustration name={name} size="full" />
      </ThemeProvider>
    </Quiet>
  );
}

/**
 * What a screen shows when it throws while rendering. The root layout's boundary sits outside the
 * theme and the toast, so this uses plain styles; the words come straight from the i18n instance.
 */
export function ErrorFallback({ error, retry, home }: ErrorBoundaryProps & { home?: () => void }) {
  const dark = useColorScheme() === 'dark';
  useEffect(() => reportError(error, { source: 'ErrorBoundary' }), [error]);
  const c = dark ? { bg: '#000000', text: '#F2F2F7', muted: '#8E8E93', primary: '#0A84FF' } : { bg: '#F2F2F7', text: '#1C1C1E', muted: '#6E6E73', primary: '#007AFF' };
  const t = (key: string, fallback: string) => i18n.t(`common:crash.${key}`, { defaultValue: fallback });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }} accessibilityRole="alert">
      <FallbackArt name="error" dark={dark} />
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{t('title', 'Something went wrong')}</Text>
      <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', maxWidth: 360, lineHeight: 21 }}>
        {t('body', "This screen hit an error. Your data is safe: anything you saved is still here. Try again, or go back to the home screen.")}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <Pressable onPress={() => void retry()} accessibilityRole="button" style={{ backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}>{t('retry', 'Try again')}</Text>
        </Pressable>
        {home ? (
          <Pressable onPress={home} accessibilityRole="button" style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: c.primary, fontWeight: '600', fontSize: 15 }}>{t('home', 'Go to home')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
