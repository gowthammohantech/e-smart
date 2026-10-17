import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import type { WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { usePageAction } from './PageHeader';

export function Fab({
  icon = 'plus',
  label,
  onPress,
  bottom = 0,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label?: string;
  onPress: () => void;
  bottom?: number;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  // A desktop has no thumb to reach for a round button: show a compact,
  // labelled "New" button instead, still pinned to the content column.
  const shownLabel = desktop ? (label ?? tr('common:component.create')) : label;
  const height = desktop ? 44 : 56;
  // Inside the desktop shell the page header shows this as its primary
  // button, so nothing floats over the content.
  const hosted = usePageAction(desktop ? { label: shownLabel ?? tr('common:component.create'), icon, onPress } : null);
  if (hosted) return null;

  return (
    <View style={{ position: 'absolute', right: t.spacing.lg, bottom: bottom + insets.bottom + t.spacing.lg }}>
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label ?? tr('common:component.create')}
        style={(state) => {
          const { pressed, hovered } = state as WebPressState;
          return [
          {
            height,
            minWidth: height,
            paddingHorizontal: shownLabel ? t.spacing.xl : 0,
            borderRadius: desktop ? t.radius.md : 28,
            backgroundColor: t.c.primary,
            opacity: hovered ? 0.9 : 1,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
          t.shadow.fab,
        ];
        }}
      >
        <MaterialCommunityIcons name={icon} size={desktop ? 20 : 26} color={t.c.onPrimary} />
        {shownLabel ? (
          <Text weight="600" style={{ color: t.c.onPrimary }}>
            {shownLabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
