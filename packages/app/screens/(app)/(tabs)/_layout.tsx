import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useComplianceSummary, useModuleSet, useUnreadCount } from '../../../store/selectors';
import { useUiStore } from '../../../store/uiStore';
import { LixiSwipeUp } from '../../../features/lixi/LixiSwipeUp';
import { LixiFloatingOrb } from '../../../features/lixi/LixiFloatingOrb';
import { LixiGestureHint } from '../../../features/lixi/LixiGestureHint';
import { openLixi } from '../../../features/lixi/open';
import { tabQuestion } from '../../../features/lixi/brain';
import { TabBar } from '@esmart/ui/components/TabBar';
import { TabSwipe } from '../../../components/TabSwipe';
import { countLabel } from '@esmart/core/lib/format';
import { TABS } from '../../../navigation/tabs';
import { PHONE_TABS } from '../../../navigation/menu';
import { PageSurface } from '@esmart/ui/components/Doodles';

/**
 * The tab bar shows `PHONE_TABS` for the plan; every other section stays
 * routable and is reached through More. The full plan has five — Home, Sell,
 * Buy, Stock, More — with Lixi reachable by gesture rather than a slot in the
 * bar: hold a tab to ask about it, swipe up on the bar, or tap the floating
 * orb. Each is switchable in Settings → Appearance.
 *
 * On either plan, swiping a screen left or right moves to the next or
 * previous tab in the bar.
 *
 * The Sales plan has four — Home, Sell, GST, More — split around Lixi's orb
 * in a floating bar, so the floating orb stays out of the way.
 */
export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
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
  const visible: readonly string[] = PHONE_TABS[moduleSet];
  // The bar sits above the system navigation bar (Android draws edge-to-edge)
  // or the home indicator, so its height grows by the inset rather than
  // being fixed — a fixed height pushed the labels under the system bar.
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0);
  // The swipe peek names the neighbouring tab, so it needs the label too.
  // Rebuilt on a language change, or the peek keeps the old language's word.
  const swipeTabs = useMemo(
    () =>
      visible.flatMap((name) =>
        TABS.filter((tab) => tab.name === name).map((tab) => ({
          ...tab,
          title: tr(`nav:tab.${tab.name}` as 'nav:tab.index'),
        })),
      ),
    [visible, tr],
  );

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
            height: 56 + bottomInset,
            paddingTop: 6,
            paddingBottom: bottomInset,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
          tabBarHideOnKeyboard: true,
        }}
        screenLayout={({ children, route, navigation }) => (
          <TabSwipe tabs={swipeTabs} current={route.name} navigation={navigation}>
            <PageSurface>{children}</PageSurface>
          </TabSwipe>
        )}
        screenListeners={({ route }) => ({
          tabLongPress: () => {
            if (!access.holdTab) return;
            markHintLearned('holdTab');
            openLixi(tabQuestion(route.name));
          },
        })}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              href: visible.includes(tab.name) ? undefined : null,
              title: tr(`nav:tab.${tab.name}` as 'nav:tab.index'),
              tabBarBadge: tab.name === 'more' && unread > 0 ? countLabel(unread) : undefined,
              tabBarBadgeStyle: { backgroundColor: t.c.bad, fontSize: 10 },
              tabBarIcon: ({ color, focused }) => (
                <Icon name={focused ? tab.activeIcon : tab.icon} size={23} color={color} />
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
