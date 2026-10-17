import { useTranslation } from 'react-i18next';
import { Tabs } from 'expo-router';
import MobileTabsLayout from '@esmart/app/screens/(app)/(tabs)/_layout';
import { TABS, tabPath } from '@esmart/app/navigation/tabs';
import { canOpen } from '@esmart/core/domain/plan';
import { usePlan } from '@esmart/app/store/selectors';
import { useIsDesktop } from '../../../src/layout';

/** Desktop: the sidebar navigates, so the tab navigator keeps its bar hidden. */
function DesktopTabs() {
  const plan = usePlan();
  const { t: tr } = useTranslation(['nav']);
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            href: canOpen(plan, tabPath(tab.name)) ? undefined : null,
            // Also the browser tab's title.
            title: tr(`nav:tab.${tab.name}` as 'nav:tab.index'),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function WebTabsLayout() {
  return useIsDesktop() ? <DesktopTabs /> : <MobileTabsLayout />;
}
