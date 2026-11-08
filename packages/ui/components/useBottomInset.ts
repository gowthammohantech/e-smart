import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'expo-router/build/react-navigation/bottom-tabs';

/**
 * The bottom safe-area inset a screen's content (or a floating button) should
 * keep clear of. Inside the tab navigator the tab bar already sits above the
 * home indicator, so a tab screen adds nothing; counting it again left a
 * double gap and floated the FAB too high.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  return inTabs ? 0 : insets.bottom;
}
