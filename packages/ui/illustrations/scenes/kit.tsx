import React, { createContext, useContext } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { ScenePalette, useScenePalette } from '../palette';
import { useLoopPhase } from '../motion';

/**
 * Shared pieces for the illustration set. Every scene draws in one 400×300 box
 * (4:3, matching `ILLUSTRATION_SIZES`) and is built from layers: a still base,
 * then the parts that float or twinkle, each in its own `Svg` inside an
 * `Animated.View` so the native driver can move it without re-rendering paths.
 */
export const VW = 400;
export const VH = 300;

export type SceneProps = { width: number; height: number };

type SceneCtx = SceneProps & { p: ScenePalette; motion: ReturnType<typeof useLoopPhase> };
const Ctx = createContext<SceneCtx | null>(null);

/** Palette and loop phase for the scene being drawn. */
export function useScene() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useScene must be used inside <Scene>');
  return c;
}

/** The frame every scene renders into. `duration` sets the loop length. */
export function Scene({ width, height, duration, children }: SceneProps & { duration?: number; children: React.ReactNode }) {
  const p = useScenePalette();
  const motion = useLoopPhase(duration);
  return (
    <Ctx.Provider value={{ width, height, p, motion }}>
      <View style={{ width, height }} pointerEvents="none">
        {children}
      </View>
    </Ctx.Provider>
  );
}

/** One drawing layer. Animate it through `style` (opacity, transforms). */
export function Layer({ style, children }: { style?: StyleProp<ViewStyle> | Animated.WithAnimatedValue<StyleProp<ViewStyle>>; children: React.ReactNode }) {
  const { width, height } = useScene();
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style as StyleProp<ViewStyle>]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** A layer that drifts up and down by `amp` scene units. */
export function Float({ amp = 5, shift = 0, children }: { amp?: number; shift?: number; children: React.ReactNode }) {
  const { motion, width } = useScene();
  return <Layer style={{ transform: [{ translateY: motion.bob(amp * (width / VW), shift) }] }}>{children}</Layer>;
}

/** A layer that pulses in and out of view. */
export function Twinkle({ shift = 0, min = 0.2, children }: { shift?: number; min?: number; children: React.ReactNode }) {
  const { motion } = useScene();
  return <Layer style={{ opacity: motion.twinkle(shift, min) }}>{children}</Layer>;
}

/* ------------------------------------------------------------------ */
/* Shapes. Coordinates are in the 400×300 scene box.                   */

/** Soft brand-coloured blobs behind the art, so it never floats on a blank page. */
export function Backdrop({ tone = 'primary' }: { tone?: 'primary' | 'good' | 'warn' | 'bad' }) {
  const { p } = useScene();
  const main = tone === 'primary' ? p.primary : p[tone];
  return (
    <G>
      <Ellipse cx={200} cy={168} rx={150} ry={104} fill={main} opacity={p.blob} />
      <Circle cx={318} cy={88} r={34} fill={p.cyan} opacity={p.blob * 0.9} />
      <Circle cx={84} cy={110} r={24} fill={p.yellow} opacity={p.blob * 0.9} />
      <Circle cx={66} cy={206} r={5} fill={main} opacity={0.35} />
      <Circle cx={340} cy={196} r={4} fill={p.cyan} opacity={0.45} />
      <Circle cx={112} cy={64} r={3} fill={main} opacity={0.4} />
    </G>
  );
}

export function Ground({ from = 84, to = 316, y = 246 }: { from?: number; to?: number; y?: number }) {
  const { p } = useScene();
  return <Path d={`M${from} ${y}H${to}`} stroke={p.ink} strokeWidth={3} strokeLinecap="round" opacity={0.35} />;
}

/** A sheet of paper, card or screen. */
export function Card({ x, y, w, h, r = 8 }: { x: number; y: number; w: number; h: number; r?: number }) {
  const { p } = useScene();
  return <Rect x={x} y={y} width={w} height={h} rx={r} fill={p.paper} stroke={p.edgeStrong} strokeWidth={2.5} />;
}

/** A line of "text" on a card. */
export function TextLine({ x, y, w, color, width = 5 }: { x: number; y: number; w: number; color?: string; width?: number }) {
  const { p } = useScene();
  return <Path d={`M${x} ${y}h${w}`} stroke={color ?? p.inkFaint} strokeWidth={width} strokeLinecap="round" />;
}

/** A filled disc with a white tick — success, done, settled. */
export function CheckBadge({ cx, cy, r, color }: { cx: number; cy: number; r: number; color?: string }) {
  const { p } = useScene();
  const c = color ?? p.good;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={c} />
      <Path
        d={`M${cx - r * 0.43} ${cy}l${r * 0.31} ${r * 0.31} ${r * 0.6} ${-r * 0.64}`}
        stroke="#fff"
        strokeWidth={Math.max(3, r * 0.16)}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </G>
  );
}

/** A four-point sparkle centred on (x, y). */
export function Sparkle({ x, y, r = 7, color }: { x: number; y: number; r?: number; color?: string }) {
  const { p } = useScene();
  return (
    <Path
      d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
      fill={color ?? p.yellow}
    />
  );
}

/** A simple standing figure with its top-left at (x, y). */
export function Person({ x, y, s = 1, accent, wave = false }: { x: number; y: number; s?: number; accent?: string; wave?: boolean }) {
  const { p } = useScene();
  const a = accent ?? p.primary;
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M0 62V34c0-11 8-20 19-20h10c11 0 19 9 19 20v28z" fill={a} />
      <Path d="M18 14h12l-6 12z" fill={p.paper} />
      <Path d="M6 62h36l-4 40H10z" fill={p.hair} opacity={0.85} />
      <Circle cx={24} cy={4} r={13} fill={p.skin} />
      <Path d="M11 2c0-8 6-13 13-13s13 5 13 13c0-4-6-6-13-6s-13 2-13 6z" fill={p.hair} />
      <Path d="M0 36l-12 24" stroke={a} strokeWidth={9} strokeLinecap="round" />
      {wave ? (
        <>
          <Path d="M48 36l14-18" stroke={a} strokeWidth={9} strokeLinecap="round" />
          <Circle cx={63} cy={16} r={5} fill={p.skin} />
        </>
      ) : (
        <Path d="M48 36l12 24" stroke={a} strokeWidth={9} strokeLinecap="round" />
      )}
    </G>
  );
}

/** A magnifying glass: lens centred on (cx, cy). */
export function Lens({ cx, cy, r, color, fill }: { cx: number; cy: number; r: number; color: string; fill?: string }) {
  const h = r * 0.72;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={fill ?? 'none'} stroke={color} strokeWidth={r * 0.16} />
      <Path d={`M${cx + h} ${cy + h}l${r * 0.66} ${r * 0.66}`} stroke={color} strokeWidth={r * 0.22} strokeLinecap="round" />
    </G>
  );
}
