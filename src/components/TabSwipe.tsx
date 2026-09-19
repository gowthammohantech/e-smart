import React, { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { useUiStore } from '@/store/uiStore';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type SwipeTab = { name: string; title: string; icon: IconName };

/** How far sideways the finger must travel before letting go switches tabs. */
const THRESHOLD = 88;
/** A quick flick switches from this far, however short of the threshold. */
const FLICK_DISTANCE = 36;
const FLICK_VELOCITY = 0.6;

/**
 * Wraps a tab's screen so a sideways swipe moves to the neighbouring tab:
 * left for the next, right for the previous. While the finger is down, the
 * tab it leads to peeks in from that edge and locks in with a haptic tick
 * past the threshold; short of it, letting go springs back.
 *
 * It only claims clearly horizontal drags, so taps, vertical scrolling and
 * horizontal scrollers inside the screen keep their touches.
 */
export function TabSwipe({
  tabs,
  current,
  navigation,
  children,
}: {
  tabs: readonly SwipeTab[];
  current: string;
  /** The screen's own navigation, which stays the same across renders. */
  navigation: { navigate: (name: string) => void };
  children: React.ReactNode;
}) {
  const t = useTheme();
  const [drag] = useState(() => new Animated.Value(0));
  const [armed, setArmed] = useState(false);

  const index = tabs.findIndex((tab) => tab.name === current);
  const prev = index > 0 ? tabs[index - 1] : undefined;
  const next = index >= 0 && index < tabs.length - 1 ? tabs[index + 1] : undefined;

  useEffect(() => {
    if (armed && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, [armed]);

  const responder = useMemo(() => {
    // Only the directions that lead somewhere; a drag toward nothing stays put.
    const clamp = (dx: number) => (dx < 0 ? (next ? dx : 0) : prev ? dx : 0);
    const settle = () => {
      setArmed(false);
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2 && clamp(g.dx) !== 0,
      onPanResponderMove: (_, g) => {
        const dx = clamp(g.dx);
        drag.setValue(dx);
        setArmed(Math.abs(dx) >= THRESHOLD);
      },
      onPanResponderRelease: (_, g) => {
        const dx = clamp(g.dx);
        const flick = Math.abs(dx) >= FLICK_DISTANCE && Math.abs(g.vx) >= FLICK_VELOCITY && Math.sign(g.vx) === Math.sign(dx);
        const target = dx < 0 ? next : prev;
        if (target && (Math.abs(dx) >= THRESHOLD || flick)) {
          // Snap back without animating, so the screen is at rest if the person comes back.
          setArmed(false);
          drag.setValue(0);
          // Once someone has done it, the swipe tip has nothing left to teach.
          useUiStore.getState().markLixiHintLearned('swipeTabs');
          navigation.navigate(target.name);
          return;
        }
        settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [drag, prev, next, navigation]);

  // The screen leans a little with the finger, with resistance.
  const lean = drag.interpolate({ inputRange: [-THRESHOLD * 2, 0, THRESHOLD * 2], outputRange: [-28, 0, 28], extrapolate: 'clamp' });

  const peek = (tab: SwipeTab, side: 'left' | 'right') => {
    // 0 at rest, 1 at the threshold.
    const progress = drag.interpolate({
      inputRange: side === 'right' ? [-THRESHOLD, 0] : [0, THRESHOLD],
      outputRange: side === 'right' ? [1, 0] : [0, 1],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '42%',
          [side]: t.spacing.md,
          opacity: progress,
          transform: [
            // Starts tucked past the edge and slides in with the finger.
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [side === 'right' ? 72 : -72, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          ],
        }}
      >
        <View
          style={[
            {
              flexDirection: side === 'right' ? 'row' : 'row-reverse',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: armed ? t.c.primary : t.c.card,
              borderWidth: t.scheme === 'dark' && !armed ? 1 : 0,
              borderColor: t.c.line,
            },
            t.shadow.card,
          ]}
        >
          <MaterialCommunityIcons name={tab.icon} size={18} color={armed ? t.c.onPrimary : t.c.primary} />
          <Text variant="caption" weight="700" style={{ color: armed ? t.c.onPrimary : t.c.text }}>
            {tab.title}
          </Text>
          <MaterialCommunityIcons
            name={side === 'right' ? 'chevron-right' : 'chevron-left'}
            size={16}
            color={armed ? t.c.onPrimary : t.c.muted}
          />
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: lean }] }}>{children}</Animated.View>
      {prev ? peek(prev, 'left') : null}
      {next ? peek(next, 'right') : null}
    </View>
  );
}
