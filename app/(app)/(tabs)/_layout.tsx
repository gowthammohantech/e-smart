import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useUnreadCount } from '@/store/selectors';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'sales', title: 'Sell', icon: 'trending-up', activeIcon: 'trending-up' },
  { name: 'gst', title: 'GST', icon: 'shield-check-outline', activeIcon: 'shield-check' },
  { name: 'more', title: 'More', icon: 'dots-horizontal-circle-outline', activeIcon: 'dots-horizontal-circle' },
];

export default function TabsLayout() {
  const t = useTheme();
  const unread = useUnreadCount();

  return (
    <Tabs
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
  );
}
