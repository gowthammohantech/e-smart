import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A soft brand-blue wash behind the Welcome screen: a gradient that fades from
 * the top into the page colour, plus two faint glows. Sits behind everything
 * and ignores touches.
 */
export function WelcomeBackdrop() {
  const t = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  // Dark needs more colour to register; light needs less to stay airy.
  const strength = t.scheme === 'dark' ? 0.34 : 0.2;

  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.c.primary} stopOpacity={strength} />
          <Stop offset="0.6" stopColor={t.c.primary} stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={t.c.info} stopOpacity={strength * 0.9} />
          <Stop offset="1" stopColor={t.c.info} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={t.c.bg} />
      <Rect x={0} y={0} width={w} height={h} fill="url(#wash)" />
      <Circle cx={w * 0.95} cy={h * 0.08} r={w * 0.55} fill="url(#glow)" />
      <Circle cx={w * 0.02} cy={h * 0.42} r={w * 0.45} fill="url(#glow)" />
    </Svg>
  );
}
