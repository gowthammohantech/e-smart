import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type PressableStateCallbackType } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { canOpen } from '@esmart/core/domain/plan';
import { countLabel } from '@esmart/core/lib/format';
import { TABS, tabForPath, tabPath, type TabName } from '@esmart/app/navigation/tabs';
import { usePlan, useUnreadCount } from '@esmart/app/store/selectors';
import { openLixi } from '@esmart/app/features/lixi/open';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** react-native-web adds pointer and keyboard state that RN's types leave out. */
type WebPressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

export const SIDEBAR_WIDTH = 248;

function NavItem({
  icon,
  label,
  active,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.md,
        height: 40,
        borderRadius: t.radius.md,
        backgroundColor: active ? t.c.card : pressed || hovered ? t.c.card2 : 'transparent',
        outlineColor: t.c.primary,
        outlineStyle: focused ? 'solid' : undefined,
        outlineWidth: focused ? 2 : 0,
        };
      }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? t.c.primary : t.c.muted} />
      <Text weight={active ? '600' : '500'} tone={active ? 'default' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {badge ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 6,
            backgroundColor: t.c.bad,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="micro" tone="onPrimary" weight="700">
            {countLabel(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The desktop replacement for the tab bar: the same destinations, always in
 * view, plus the shortcuts a phone keeps behind More. A plan that can't open
 * a section doesn't list it, exactly as the tab bar hides it.
 */
export function Sidebar() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const pathname = usePathname();
  const plan = usePlan();
  const unread = useUnreadCount();

  const current = tabForPath(pathname);
  const go = (name: TabName) => router.navigate(name === 'index' ? '/(app)/(tabs)' : `/(app)/(tabs)/${name}`);

  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        backgroundColor: t.c.paper,
        borderRightWidth: 1,
        borderRightColor: t.c.line,
      }}
    >
      <View style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.lg }}>
        <BrandLogo height={32} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: t.spacing.sm, gap: 2 }}>
        {TABS.filter((tab) => canOpen(plan, tabPath(tab.name))).map((tab) => (
          <NavItem
            key={tab.name}
            icon={current === tab.name ? tab.activeIcon : tab.icon}
            label={tr(`nav:tab.${tab.name}` as 'nav:tab.index')}
            active={current === tab.name}
            onPress={() => go(tab.name)}
          />
        ))}
        <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: t.spacing.md }} />
        <NavItem icon="magnify" label={tr('nav:more.entry.globalSearch')} onPress={() => router.push('/(app)/search')} />
        <NavItem
          icon="bell-outline"
          label={tr('nav:more.entry.notifications')}
          badge={unread}
          onPress={() => router.push('/(app)/notifications')}
        />
        <NavItem icon="creation-outline" label={tr('nav:more.entry.askLixi')} onPress={() => openLixi()} />
      </ScrollView>
    </View>
  );
}
