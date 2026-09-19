import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useComplianceSummary, useUnreadCount } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { LixiSwipeUp } from '@/features/lixi/LixiSwipeUp';
import { LixiFloatingOrb } from '@/features/lixi/LixiFloatingOrb';
import { openLixi } from '@/features/lixi/open';
import { TAB_QUESTIONS } from '@/features/lixi/brain';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'sales', title: 'Sell', icon: 'trending-up', activeIcon: 'trending-up' },
  { name: 'purchases', title: 'Buy', icon: 'cart-outline', activeIcon: 'cart' },
  { name: 'inventory', title: 'Stock', icon: 'package-variant-closed', activeIcon: 'package-variant' },
  { name: 'contacts', title: 'People', icon: 'account-group-outline', activeIcon: 'account-group' },
  { name: 'reports', title: 'Reports', icon: 'chart-box-outline', activeIcon: 'chart-box' },
  { name: 'more', title: 'More', icon: 'dots-horizontal-circle-outline', activeIcon: 'dots-horizontal-circle' },
];

/**
 * The seven tabs, with Lixi reachable by gesture rather than a slot in the
 * bar: hold a tab to ask about it, swipe up on the bar, or tap the floating
 * orb. Each is switchable in Settings → Appearance.
 */
export default function TabsLayout() {
  const t = useTheme();
  const unread = useUnreadCount();
  const access = useUiStore((s) => s.lixiAccess);
  const compliance = useComplianceSummary();
  // Lixi raises its hand for what costs money if it waits. An expired bill
  // is a finished trip, so it doesn't count.
  const lixiNudge = compliance.eInvoice.failed + compliance.expiringSoon;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <LixiSwipeUp enabled={access.swipeUp}>
            <BottomTabBar {...props} />
          </LixiSwipeUp>
        )}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.c.primary,
          tabBarInactiveTintColor: t.c.muted,
          tabBarStyle: {
            backgroundColor: t.c.paper,
            borderTopColor: t.c.line,
            borderTopWidth: 0.5,
            height: Platform.OS === 'ios' ? 84 : 62,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
          tabBarHideOnKeyboard: true,
        }}
        screenListeners={({ route }) => ({
          tabLongPress: () => {
            if (access.holdTab) openLixi(TAB_QUESTIONS[route.name]);
          },
        })}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarBadge: tab.name === 'more' && unread > 0 ? unread : undefined,
              tabBarBadgeStyle: { backgroundColor: t.c.bad, fontSize: 10 },
              tabBarIcon: ({ color, focused }) => (
                <MaterialCommunityIcons name={focused ? tab.activeIcon : tab.icon} size={23} color={color} />
              ),
            }}
          />
        ))}
      </Tabs>

      {access.floatingOrb ? <LixiFloatingOrb nudge={lixiNudge} /> : null}
    </View>
  );
}
