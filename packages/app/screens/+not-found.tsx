import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { PageBackdrop } from '@esmart/ui/components/PageBackdrop';

/** A typed or stale address that matches no screen. Signed out, the root layout sends it to sign-in first. */
export default function NotFound() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, padding: t.spacing.lg, justifyContent: 'center' }}>
      <PageBackdrop />
      <Stack.Screen options={{ title: tr('common:notFound.title') }} />
      <EmptyState illustration="not-found" title={tr('common:notFound.title')} message={tr('common:notFound.route')} actionLabel={tr('common:notFound.goHome')} onAction={() => router.replace('/(app)/(tabs)')} />
    </View>
  );
}
