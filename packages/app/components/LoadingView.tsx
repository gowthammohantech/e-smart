import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';

/** A screen whose record is still on its way from the server. */
export function LoadingView({ title }: { title?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar">
      {title !== undefined ? <Stack.Screen options={{ title }} /> : null}
      <ActivityIndicator color={t.c.muted} />
    </View>
  );
}
