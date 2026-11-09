import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Screen } from '@esmart/ui/components/Screen';
import { useIsDesktop, WIDE_FORM_MAX_WIDTH } from '@esmart/ui/theme/breakpoints';
import { DetailSkeleton, FormSkeleton, ListSkeleton, PageSkeleton, ReportPageSkeleton } from './ScreenSkeleton';

export type LoadingVariant = 'detail' | 'form' | 'items-form' | 'report' | 'list' | 'page' | 'spinner';

/**
 * A screen whose data is still on its way from the server, drawn as the shape of
 * what's coming: a record, a form, a report, a list, a printed page. `spinner` is
 * for the odd screen with no fixed shape.
 */
export function LoadingView({ title, variant = 'detail', keepTitle }: { title?: string; variant?: LoadingVariant; keepTitle?: boolean }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  // Untitled, the header would show the route's file path until the record lands. `keepTitle` is for
  // a part of a screen (an editor) whose screen has set the title already.
  const head = keepTitle ? null : <Stack.Screen options={{ title: title ?? '' }} />;
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
        // A desktop form stops at the long-form width, so the skeleton does too and nothing jumps
        // when the form lands. A document editor (items) uses the whole column, as its grid does.
        <View style={desktop && variant === 'form' ? { width: '100%', maxWidth: WIDE_FORM_MAX_WIDTH, alignSelf: 'flex-start' } : undefined}>
          <FormSkeleton items={variant === 'items-form'} />
        </View>
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
