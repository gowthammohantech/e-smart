import React, { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useComplianceSummary, useModuleSet, useUnreadCount } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { LixiSwipeUp } from '@/features/lixi/LixiSwipeUp';
import { LixiFloatingOrb } from '@/features/lixi/LixiFloatingOrb';
import { LixiGestureHint } from '@/features/lixi/LixiGestureHint';
import { openLixi } from '@/features/lixi/open';
import { TAB_QUESTIONS } from '@/features/lixi/brain';
import { TabBar } from '@/components/TabBar';
import { TabSwipe } from '@/components/TabSwipe';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'sales', title: 'Sell', icon: 'trending-up', activeIcon: 'trending-up' },
  { name: 'purchases', title: 'Buy', icon: 'cart-outline', activeIcon: 'cart' },
  { name: 'inventory', title: 'Stock', icon: 'package-variant-closed', activeIcon: 'package-variant' },
  { name: 'gst', title: 'GST', icon: 'shield-check-outline', activeIcon: 'shield-check' },
  { name: 'contacts', title: 'People', icon: 'account-group-outline', activeIcon: 'account-group' },
  { name: 'reports', title: 'Reports', icon: 'chart-box-outline', activeIcon: 'chart-box' },
  { name: 'more', title: 'More', icon: 'dots-horizontal-circle-outline', activeIcon: 'dots-horizontal-circle' },
];

/** Which tabs each plan shows, in bar order. The rest stay routable but unlisted. */
const VISIBLE = {
  full: ['index', 'sales', 'purchases', 'inventory', 'contacts', 'reports', 'more'],
  sales: ['index', 'sales', 'gst', 'more'],
} as const;

/**
 * The full plan has seven tabs, with Lixi reachable by gesture rather than a
 * slot in the bar: hold a tab to ask about it, swipe up on the bar, or tap
 * the floating orb. Each is switchable in Settings → Appearance.
 *
 * On either plan, swiping a screen left or right moves to the next or
 * previous tab in the bar.
 *
 * The Sales plan has four — Home, Sell, GST, More — split around Lixi's orb
 * in a floating bar, so the floating orb stays out of the way.
 */
export default function TabsLayout() {
  const t = useTheme();
  const unread = useUnreadCount();
  const access = useUiStore((s) => s.lixiAccess);
  const markHintLearned = useUiStore((s) => s.markLixiHintLearned);
  // The bar's height, measured, so the gesture tip can sit just above it.
  const [barHeight, setBarHeight] = useState(0);
  const compliance = useComplianceSummary();
  // Lixi raises its hand for what costs money if it waits. An expired bill
  // is a finished trip, so it doesn't count.
  const lixiNudge = compliance.eInvoice.failed + compliance.expiringSoon;
  const moduleSet = useModuleSet();
  const visible: readonly string[] = VISIBLE[moduleSet];
  const swipeTabs = useMemo(() => visible.flatMap((name) => TABS.filter((tab) => tab.name === name)), [visible]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <View onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
            <LixiSwipeUp enabled={access.swipeUp}>
              {moduleSet === 'sales' ? (
                <TabBar {...props} visible={visible} lixiNudge={lixiNudge} />
              ) : (
                <BottomTabBar {...props} />
              )}
            </LixiSwipeUp>
          </View>
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
        screenLayout={({ children, route, navigation }) => (
          <TabSwipe tabs={swipeTabs} current={route.name} navigation={navigation}>
            {children}
          </TabSwipe>
        )}
        screenListeners={({ route }) => ({
          tabLongPress: () => {
            if (!access.holdTab) return;
            markHintLearned('holdTab');
            openLixi(TAB_QUESTIONS[route.name]);
          },
        })}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              href: visible.includes(tab.name) ? undefined : null,
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

      {barHeight > 0 ? <LixiGestureHint bottom={barHeight} /> : null}
      {access.floatingOrb && moduleSet === 'full' ? <LixiFloatingOrb nudge={lixiNudge} /> : null}
    </View>
  );
}
