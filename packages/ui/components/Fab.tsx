import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import * as Haptics from 'expo-haptics';
import { useBottomInset } from './useBottomInset';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import type { WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { usePageAction, type PageActionAnchor } from './PageHeader';

/** Bottom padding a scrolling list needs so its last row clears a phone FAB (56 tall, 16 up, plus a gap). */
export const FAB_CLEARANCE = 96;

export function Fab({
  icon = 'plus',
  label,
  onPress,
  bottom = 0,
}: {
  icon?: IconName;
  label?: string;
  /** On a desktop it runs from the page header, which passes the button's place (see PageAction). */
  onPress: (anchor?: PageActionAnchor) => void;
  bottom?: number;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const safeBottom = useBottomInset();
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
    <View style={{ position: 'absolute', right: t.spacing.lg, bottom: bottom + safeBottom + t.spacing.lg }}>
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
        <Icon name={icon} size={desktop ? 20 : 26} color={t.c.onPrimary} />
        {shownLabel ? (
          <Text weight="600" style={{ color: t.c.onPrimary }}>
            {shownLabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
