import React, { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { LixiOrb } from './LixiOrb';
import { openLixi } from './open';

/** How far up the finger must travel before letting go opens Lixi. */
const THRESHOLD = 72;
const ORB = 52;

/**
 * Wraps the tab bar so an upward drag pulls Lixi's orb out of it. Taps still
 * reach the tabs: the gesture only claims the touch once it is clearly a
 * vertical swipe. Past the threshold the orb locks in with a haptic tick and
 * letting go opens Lixi; short of it, the orb sinks back.
 */
export function LixiSwipeUp({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const t = useTheme();
  const [lift] = useState(() => new Animated.Value(0));
  const [armed, setArmed] = useState(false);

  // One tick as the orb locks in. React skips the repeat setArmed(true) calls.
  useEffect(() => {
    if (armed && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, [armed]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => enabled && g.dy < -10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          const up = Math.max(0, -g.dy);
          // Resistance past the threshold, so the orb feels tethered.
          lift.setValue(up < THRESHOLD ? up : THRESHOLD + (up - THRESHOLD) * 0.3);
          setArmed(up >= THRESHOLD);
        },
        onPanResponderRelease: (_, g) => {
          if (-g.dy >= THRESHOLD) openLixi();
          setArmed(false);
          Animated.spring(lift, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 200 }).start();
        },
        onPanResponderTerminate: () => {
          setArmed(false);
          Animated.spring(lift, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [enabled, lift],
  );

  const progress = lift.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View {...responder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '100%',
          alignItems: 'center',
          gap: 6,
          opacity: progress,
          transform: [
            // Starts tucked behind the bar and rises with the finger.
            { translateY: Animated.subtract(ORB + 8, lift) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
          ],
        }}
      >
        <LixiOrb size={ORB} thinking={armed} />
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.c.card }}>
          <Text variant="caption" weight="700" style={{ color: armed ? t.c.primary : t.c.muted }}>
            {armed ? 'Let go to ask Lixi' : 'Keep pulling'}
          </Text>
        </View>
      </Animated.View>
      {children}
    </View>
  );
}
