import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { useSettingsGroups, type MoreEntry } from '@esmart/app/navigation/moreGroups';

export const SETTINGS_NAV_WIDTH = 240;

/** A route as the browser shows it: no `(group)` segments, no query. */
function publicPath(route: string): string {
  return route.split('?')[0].replace(/\/\([^/)]+\)/g, '') || '/';
}

function Entry({ entry, active }: { entry: MoreEntry; active: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const href = publicPath(entry.route);
  return (
    <Pressable
      {...({ href } as object)}
      onPress={(e) => {
        e.preventDefault();
        router.navigate(entry.route as never);
      }}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            height: 32,
            paddingHorizontal: t.spacing.sm,
            borderRadius: t.radius.sm,
            backgroundColor: active ? t.c.chip : pressed || hovered ? t.c.mutedSoft : 'transparent',
          },
          focusRing(t, focused),
        ];
      }}
    >
      <Icon name={entry.icon} size={16} color={active ? t.c.primary : t.c.muted} />
      <Text variant="small" weight={active ? '600' : '500'} tone={active ? 'primary' : 'default'} numberOfLines={1} style={{ flex: 1 }}>
        {entry.label}
      </Text>
      {entry.badge ? (
        <Text variant="micro" tone="bad" weight="600">
          {entry.badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Settings on a desktop: every settings page listed down the left, so moving
 * between them is one click instead of back-and-forth through More.
 */
export function SettingsNav() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const pathname = usePathname();
  const groups = useSettingsGroups();

  return (
    <View style={{ width: SETTINGS_NAV_WIDTH, paddingTop: t.spacing.xxl }} role="navigation" aria-label={tr('nav:shell.settingsNavigation')}>
      <ScrollView contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.xl }}>
        {groups.map((g) => (
          <View key={g.key} style={{ gap: 2 }}>
            <Text
              variant="micro"
              tone="muted"
              weight="600"
              style={{ textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: t.spacing.sm, paddingBottom: 4 }}
            >
              {g.title}
            </Text>
            {g.entries.map((e) => (
              <Entry key={e.route} entry={e} active={pathname === publicPath(e.route) || pathname.startsWith(`${publicPath(e.route)}/`)} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
