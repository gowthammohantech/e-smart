import React from 'react';
import { Platform, Pressable } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { hubFor } from './hubBack';

/**
 * The header's back button for the first screen of a stack: there is no screen to go back to, so
 * it replaces this one with the hub it belongs to.
 */
export function HubBackButton() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { t: tr } = useTranslation('common');
  return (
    <Pressable
      onPress={() => router.replace(hubFor(pathname) as never)}
      accessibilityRole="button"
      accessibilityLabel={tr('action.back')}
      hitSlop={12}
      style={({ pressed }) => ({ paddingRight: t.spacing.md, opacity: pressed ? 0.5 : 1 })}
    >
      <Icon name={Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left'} size={Platform.OS === 'ios' ? 28 : 24} color={t.c.text} />
    </Pressable>
  );
}

/** Stack screen options: the first screen other than the tabs gets the hub back button. */
export function hubBackOptions(route: { key: string; name: string }, navigation: { getState: () => { routes: readonly { key: string }[] } }) {
  if (route.name === '(tabs)' || route.name === 'lixi') return null;
  return navigation.getState().routes[0]?.key === route.key ? { headerLeft: () => <HubBackButton /> } : null;
}
