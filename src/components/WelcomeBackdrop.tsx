import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { LIXI } from '@/features/lixi/LixiOrb';

/**
 * The wash behind the Welcome screen: a faint dot grid across the top that
 * fades into the page, and three soft glows in the brand and Lixi colours.
 * Sits behind everything and ignores touches.
 */
export function WelcomeBackdrop() {
  const t = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  // Dark needs more colour to register; light needs less to stay airy.
  const strength = t.scheme === 'dark' ? 0.3 : 0.18;

  const glow = (id: string, color: string) => (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={color} stopOpacity={strength} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );

  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="dots" x={0} y={0} width={22} height={22} patternUnits="userSpaceOnUse">
          <Circle cx={11} cy={11} r={1.2} fill={t.c.muted} opacity={t.scheme === 'dark' ? 0.35 : 0.3} />
        </Pattern>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.c.bg} stopOpacity={0} />
          <Stop offset="0.55" stopColor={t.c.bg} stopOpacity={1} />
        </LinearGradient>
        {glow('glowBlue', t.c.primary)}
        {glow('glowCyan', LIXI.cyan)}
        {glow('glowGold', LIXI.yellow)}
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={t.c.bg} />
      <Rect x={0} y={0} width={w} height={h} fill="url(#dots)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#fade)" />
      <Circle cx={w * 0.5} cy={-h * 0.02} r={w * 0.6} fill="url(#glowBlue)" />
      <Circle cx={w * 0.95} cy={h * 0.12} r={w * 0.5} fill="url(#glowCyan)" />
      <Circle cx={w * 0.02} cy={h * 0.4} r={w * 0.45} fill="url(#glowGold)" />
    </Svg>
  );
}
