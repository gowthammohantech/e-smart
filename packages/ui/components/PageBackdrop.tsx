import React, { useId, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { useLoopPhase } from '../illustrations/motion';
import { LIXI } from './LixiOrb';
import { DoodleWallpaper } from './Doodles';

/**
 * A quieter cousin of `WelcomeBackdrop` for screens that would otherwise be a
 * bare page — sign-in, onboarding, not-found, loading. A faint doodle
 * wallpaper drifts across the page, with two soft glows drifting over it. Sits
 * behind everything, ignores touches, and holds still under Reduce Motion.
 */
export function PageBackdrop({ surface }: { surface?: string }) {
  const t = useTheme();
  const id = useId().replace(/:/g, '');
  const window = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const { bob } = useLoopPhase(14000);
  const w = size?.w ?? window.width;
  const h = size?.h ?? window.height;
  const bg = surface ?? t.c.bg;
  const strength = t.scheme === 'dark' ? 0.22 : 0.12;

  const glow = (gid: string, color: string) => (
    <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={color} stopOpacity={strength} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );

  return (
    <View
      // Clipped: the glows drift past the edges, and unclipped they widen the page (a sideways scroll on the web).
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />
      <DoodleWallpaper />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: bob(18, 0) }, { translateY: bob(12, 0.25) }] }]}>
        <Svg width={w} height={h}>
          <Defs>{glow(`${id}blue`, t.c.primary)}</Defs>
          <Circle cx={w * 0.85} cy={h * 0.04} r={Math.max(w, 320) * 0.55} fill={`url(#${id}blue)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: bob(-16, 0.5) }, { translateY: bob(10, 0.75) }] }]}>
        <Svg width={w} height={h}>
          <Defs>{glow(`${id}cyan`, LIXI.cyan)}</Defs>
          <Circle cx={w * 0.05} cy={h * 0.3} r={Math.max(w, 320) * 0.4} fill={`url(#${id}cyan)`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
