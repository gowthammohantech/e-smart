import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useBottomInset } from './useBottomInset';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { SHOW_SCROLLBAR } from '../theme/breakpoints';

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
  /** iOS caption under the pull spinner, for pulls that do more than refresh. */
  refreshTitle?: string;
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
  refreshTitle,
  background = 'bg',
}: Props) {
  const t = useTheme();
  const safeBottom = useBottomInset();
  // 'bg' stays clear so the navigator's doodle page (PageSurface) shows through.
  const bg = background === 'bg' ? 'transparent' : t.c.card;

  const inner: StyleProp<ViewStyle> = [
    padded ? { paddingHorizontal: t.spacing.lg } : null,
    { paddingBottom: bottomInset + safeBottom + t.spacing.xl },
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
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={t.c.muted}
            title={refreshTitle}
            titleColor={t.c.muted}
          />
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
      <Text variant="caption" tone="muted" accessibilityRole="header" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </Text>
      {action ? (
        // Named with its section, so several "Export CSV" links on a page tell apart.
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${action}, ${title}`}>
          <Text variant="small" tone="primary" weight="600">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
