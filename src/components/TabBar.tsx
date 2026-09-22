import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Keyboard, LayoutChangeEvent, Platform, Pressable, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIXI, LixiOrb } from '@/features/lixi/LixiOrb';
import { Text } from './Text';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const BAR_HEIGHT = 64;
const ORB = 54;
/** The ring of page colour around the orb that reads as a notch in the bar. */
const NOTCH = 5;
/** How far the orb's centre sits below the bar's top edge. */
const SINK = 10;
/** Room above the bar for the part of the orb that rises out of it. */
const RISE = ORB / 2 + NOTCH - SINK;

/** Five equal slots; the middle one belongs to Lixi. */
const slotOf = (position: number) => (position < 2 ? position : position + 1);

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/**
 * A floating pill with four tabs split around Lixi's orb, which sits in a
 * notch on the bar's top edge. A soft highlight slides between tabs rather
 * than jumping. `lixiNudge` puts a count on the orb when Lixi has something
 * worth raising.
 *
 * `visible` names the four routes to show, in order. The navigator still
 * holds every tab route the plan hides, so the bar picks by name rather than
 * by position in `state.routes`.
 */
export function TabBar({
  state,
  descriptors,
  navigation,
  visible,
  lixiNudge = 0,
}: TabBarProps & { visible: readonly string[]; lixiNudge?: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [slide] = useState(() => new Animated.Value(0));
  const [keyboard, setKeyboard] = useState(false);

  const slotWidth = width / 5;
  const focusedName = state.routes[state.index]?.name;
  // A hidden tab can still be pushed to (Customers, Reports from More); the
  // highlight then rests where it was and fades out.
  const visibleIndex = visible.indexOf(focusedName ?? '');
  const focusedPosition = Math.max(0, visibleIndex);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: slotOf(focusedPosition) * slotWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [focusedPosition, slotWidth, slide]);

  // Android lays the keyboard over the bar otherwise; iOS already covers it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboard) return null;

  const renderTab = (position: number) => {
    const route = state.routes.find((r) => r.name === visible[position]);
    if (!route) return null;
    const { options } = descriptors[route.key];
    const focused = route.name === focusedName;
    const color = focused ? t.c.primary : t.c.muted;
    const label = options.title ?? route.name;
    const badge = options.tabBarBadge;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        tap();
        navigation.navigate(route.name, route.params);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? tr('nav:tabBadgeA11y', { label, count: badge }) : label}
        style={{ flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 3 }}
      >
        <View>
          {options.tabBarIcon?.({ focused, color, size: 23 })}
          {badge != null ? (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -9,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 4,
                borderRadius: 8,
                backgroundColor: t.c.bad,
                borderWidth: 2,
                borderColor: t.c.paper,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {/* Tamil labels run 30-40% longer than English and there are up to
            seven of them. `adjustsFontSizeToFit` is iOS-only, so Android
            relies on the nine-grapheme budget the catalogue test enforces;
            `includeFontPadding` reclaims the few pixels Tamil ascender
            metrics would otherwise eat. */}
        <Text
          numberOfLines={1}
          ellipsizeMode="clip"
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{
            color,
            fontSize: 10,
            fontWeight: focused ? '700' : '600',
            textAlign: 'center',
            includeFontPadding: false,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        backgroundColor: t.c.bg,
        paddingHorizontal: t.spacing.lg,
        paddingTop: RISE,
        // iOS's home indicator tolerates a little overlap; Android's navigation bar does not.
        paddingBottom: Math.max(Platform.OS === 'ios' ? insets.bottom - 10 : insets.bottom, t.spacing.md),
      }}
    >
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={[
          {
            height: BAR_HEIGHT,
            borderRadius: BAR_HEIGHT / 2,
            backgroundColor: t.c.paper,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            flexDirection: 'row',
            alignItems: 'center',
          },
          t.shadow.card,
        ]}
      >
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 6,
              top: 7,
              width: slotWidth - 12,
              height: BAR_HEIGHT - 14 - (t.scheme === 'dark' ? 2 : 0),
              borderRadius: (BAR_HEIGHT - 14) / 2,
              backgroundColor: t.c.chip,
              opacity: visibleIndex < 0 ? 0 : 1,
              transform: [{ translateX: slide }],
            }}
          />
        ) : null}

        {renderTab(0)}
        {renderTab(1)}

        <View style={{ flex: 1, height: BAR_HEIGHT }} />

        {renderTab(2)}
        {renderTab(3)}
      </View>

      {width > 0 ? (
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push('/(app)/lixi');
          }}
          accessibilityRole="button"
          accessibilityLabel={lixiNudge ? `Ask Lixi, ${lixiNudge} things to look at` : 'Ask Lixi, your assistant'}
          style={({ pressed }) => ({
            position: 'absolute',
            // Hung off the outer view, not the pill: Android drops touches
            // that land outside a parent's bounds.
            top: 0,
            left: t.spacing.lg + width / 2 - ORB / 2 - NOTCH,
            padding: NOTCH,
            borderRadius: ORB,
            backgroundColor: t.c.bg,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <LixiOrb size={ORB} />
          {lixiNudge > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 2,
                right: 0,
                minWidth: 20,
                height: 20,
                paddingHorizontal: 5,
                borderRadius: 10,
                backgroundColor: LIXI.red,
                borderWidth: 2,
                borderColor: t.c.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{lixiNudge}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}
