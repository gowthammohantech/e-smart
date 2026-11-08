import React, { useEffect, useId, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { NATIVE_DRIVER } from '../theme/motion';
import { useReducedMotion } from '../theme/useReducedMotion';
import { useLoopPhase } from '../illustrations/motion';
import { DOODLES, SCATTER, WALLPAPER_TILE, placeDoodle } from '../illustrations/doodles';

/**
 * How much the doodles show: a texture you notice only when you look for it,
 * never enough to pull the eye from the page (halved from 0.14 / 0.16, which
 * read as busy behind every screen).
 */
const useInk = () => {
  const t = useTheme();
  return { color: t.c.muted, opacity: t.scheme === 'dark' ? 0.08 : 0.07 };
};

/** One tile's drift: slow enough that the movement is felt rather than watched. */
const DRIFT_MS = 180_000;

/**
 * A full-bleed wallpaper of line-art doodles that drifts diagonally, one tile
 * every three minutes, and loops seamlessly. Sits behind everything and ignores touches;
 * stands still under Reduce Motion.
 */
export function DoodleWallpaper() {
  const ink = useInk();
  const id = useId().replace(/:/g, '');
  const window = useWindowDimensions();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const reduce = useReducedMotion();
  const [drift] = useState(() => new Animated.Value(0));
  const tile = WALLPAPER_TILE.size;
  const w = (size?.w ?? window.width) + tile;
  const h = (size?.h ?? window.height) + tile;

  useEffect(() => {
    if (reduce) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [drift, reduce]);

  const shift = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -tile] });

  return (
    <View
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Animated.View style={{ width: w, height: h, opacity: ink.opacity, transform: [{ translateX: shift }, { translateY: shift }] }}>
        <Svg width={w} height={h}>
          <Defs>
            <Pattern id={`${id}tile`} x={0} y={0} width={tile} height={tile} patternUnits="userSpaceOnUse">
              <G fill="none" stroke={ink.color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                {WALLPAPER_TILE.items.map((it, i) => (
                  <Path key={i} transform={placeDoodle(it)} d={DOODLES[it.name]} />
                ))}
              </G>
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill={`url(#${id}tile)`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * A few doodles scattered around a screen's edges, each bobbing on its own
 * beat. For busy screens where a full wallpaper would be noise. Place it as
 * the first child of the screen's root so the content draws over it.
 */
export function DoodleScatter() {
  const ink = useInk();
  const t = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // A slow, small bob: alive, not moving enough to catch the eye while reading.
  const { bob } = useLoopPhase(12000);

  return (
    <View
      // Clipped: a doodle turned at the right edge pokes a few pixels past it, which on the web widens the page.
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size
        ? SCATTER.map((it, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: Math.min(it.x * size.w, size.w - it.size),
                top: Math.min(it.y * size.h, size.h - it.size),
                opacity: it.name === 'sparkle' ? ink.opacity * 1.6 : ink.opacity * 1.3,
                transform: [{ translateY: bob(2, i * 0.17) }, { rotate: `${it.rotate}deg` }],
              }}
            >
              <Svg width={it.size} height={it.size} viewBox="0 0 48 48">
                <Path
                  d={DOODLES[it.name]}
                  fill="none"
                  stroke={it.name === 'sparkle' ? t.c.primary : ink.color}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
          ))
        : null}
    </View>
  );
}

/**
 * The page every in-app screen sits on: the page colour, the doodle wallpaper
 * and a few larger doodles around the edges. Navigators draw it once per
 * screen (`screenLayout`), and screens leave their own root transparent so it
 * shows through between their cards. Each screen keeps its own opaque surface,
 * so a screen sliding in never shows the one beneath it.
 */
export function PageSurface({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <DoodleWallpaper />
      <DoodleScatter />
      {children}
    </View>
  );
}
