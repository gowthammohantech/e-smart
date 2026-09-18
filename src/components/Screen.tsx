import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding so content clears a FAB or sticky footer. */
  bottomInset?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  background?: 'bg' | 'card';
};

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  contentStyle,
  bottomInset = 0,
  onRefresh,
  refreshing,
  background = 'bg',
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bg = background === 'bg' ? t.c.bg : t.c.card;

  const inner: StyleProp<ViewStyle> = [
    padded ? { paddingHorizontal: t.spacing.lg } : null,
    { paddingBottom: bottomInset + insets.bottom + t.spacing.xl },
    contentStyle,
  ];

  if (!scroll) {
    return <View style={[{ flex: 1, backgroundColor: bg }, style]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: bg }, style]}
      contentContainerStyle={inner}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.c.muted} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Vertical rhythm helper. */
export function Spacer({ size = 'lg' }: { size?: keyof ReturnType<typeof useTheme>['spacing'] }) {
  const t = useTheme();
  return <View style={{ height: t.spacing[size] }} />;
}

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: t.spacing.xl,
          paddingBottom: t.spacing.sm,
        },
        style,
      ]}
    >
      <Text variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={action}>
          <Text variant="small" tone="primary" weight="600">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
