import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Screen } from '@esmart/ui/components/Screen';
import { DetailSkeleton, FormSkeleton, ListSkeleton, PageSkeleton, ReportPageSkeleton } from './ScreenSkeleton';

export type LoadingVariant = 'detail' | 'form' | 'items-form' | 'report' | 'list' | 'page' | 'spinner';

/**
 * A screen whose data is still on its way from the server, drawn as the shape of
 * what's coming: a record, a form, a report, a list, a printed page. `spinner` is
 * for the odd screen with no fixed shape.
 */
export function LoadingView({ title, variant = 'detail' }: { title?: string; variant?: LoadingVariant }) {
  const t = useTheme();
  const head = title !== undefined ? <Stack.Screen options={{ title }} /> : null;
  if (variant === 'spinner') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar">
        {head}
        <ActivityIndicator color={t.c.muted} />
      </View>
    );
  }
  return (
    <Screen contentStyle={{ paddingTop: t.spacing.lg }}>
      {head}
      {variant === 'form' || variant === 'items-form' ? (
        <FormSkeleton items={variant === 'items-form'} />
      ) : variant === 'report' ? (
        <ReportPageSkeleton />
      ) : variant === 'list' ? (
        <ListSkeleton />
      ) : variant === 'page' ? (
        <PageSkeleton />
      ) : (
        <DetailSkeleton />
      )}
    </Screen>
  );
}
