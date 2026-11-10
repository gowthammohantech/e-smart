import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';

/** One part of Your profile (sign-in security, devices, privacy): a heading and what it holds, anchored by `id` on the web. */
export function AccountSection({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md }} nativeID={id}>
      <Text variant="caption" tone="muted" weight="600" accessibilityRole="header" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
