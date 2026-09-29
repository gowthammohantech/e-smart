import { Tabs } from 'expo-router';
import MobileTabsLayout from '@esmart/app/screens/(app)/(tabs)/_layout';
import { TABS, tabPath } from '@esmart/app/navigation/tabs';
import { canOpen } from '@esmart/core/domain/plan';
import { usePlan } from '@esmart/app/store/selectors';
import { useIsDesktop } from '../../../src/layout';

/** Desktop: the sidebar navigates, so the tab navigator keeps its bar hidden. */
function DesktopTabs() {
  const plan = usePlan();
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ href: canOpen(plan, tabPath(tab.name)) ? undefined : null }}
        />
      ))}
    </Tabs>
  );
}

export default function WebTabsLayout() {
  return useIsDesktop() ? <DesktopTabs /> : <MobileTabsLayout />;
}
