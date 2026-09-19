import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useComplianceSummary, useUnreadCount } from '@/store/selectors';
import { TabBar } from '@/components/TabBar';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'sales', title: 'Sell', icon: 'trending-up', activeIcon: 'trending-up' },
  { name: 'gst', title: 'GST', icon: 'shield-check-outline', activeIcon: 'shield-check' },
  { name: 'more', title: 'More', icon: 'dots-horizontal-circle-outline', activeIcon: 'dots-horizontal-circle' },
];

export default function TabsLayout() {
  const unread = useUnreadCount();
  const compliance = useComplianceSummary();
  // Lixi raises its hand for the things that cost money if they wait.
  const lixiNudge = compliance.failed + compliance.ewbExpiringToday + compliance.ewbExpired;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} lixiNudge={lixiNudge} />}
      screenOptions={{ headerShown: false }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: tab.name === 'more' && unread > 0 ? unread : undefined,
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons name={focused ? tab.activeIcon : tab.icon} size={23} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
