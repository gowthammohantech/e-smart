import React, { createContext, useContext, useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { NATIVE_DRIVER } from '../theme/motion';
import { useIsDesktop } from '../theme/breakpoints';
import { useReducedMotion } from '../theme/useReducedMotion';

const WEB = Platform.OS === 'web';
/** One sweep of the highlight across a block. Matches the admin console's shimmer. */
const SWEEP_MS = 1400;

const ShimmerContext = createContext<Animated.Value | null>(null);

/**
 * A looping 0..1 phase for the shimmer, or null when it should stand still:
 * under Reduce Motion, or when a provider above already runs one.
 */
function useShimmerPhase(enabled: boolean) {
  const [v] = useState(() => new Animated.Value(0));
  const reduce = useReducedMotion();
  const run = enabled && !reduce;
  useEffect(() => {
    if (!run) return;
    v.setValue(0);
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: SWEEP_MS,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, run]);
  return run ? v : null;
}

/**
 * Runs one shimmer loop for everything under it, so a screen's placeholders sweep
 * together and only one animation runs, however many blocks there are.
 */
export function ShimmerProvider({ children }: { children: React.ReactNode }) {
  const parent = useContext(ShimmerContext);
  const own = useShimmerPhase(parent === null);
  if (parent) return <>{children}</>;
  // Under Reduce Motion there's no loop; the blocks fall back to standing still.
  return <ShimmerContext.Provider value={own}>{children}</ShimmerContext.Provider>;
}

/** A placeholder block with a soft highlight sweeping across it. Hidden from assistive tech. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
  style,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const shared = useContext(ShimmerContext);
  const own = useShimmerPhase(shared === null);
  const phase = shared ?? own;
  const [w, setW] = useState(0);
  const gid = `sk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // A lighter band than the block in both themes.
  const hi = t.scheme === 'dark' ? t.c.lineStrong : '#FFFFFF';
  const peak = t.scheme === 'dark' ? 0.55 : 0.75;

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== w) setW(next);
  };

  return (
    <View
      onLayout={onLayout}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height,
          width,
          borderRadius: radius,
          backgroundColor: t.c.card2,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {phase && w > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: w,
            transform: [
              {
                translateX: phase.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-w, w],
                }),
              },
            ],
          }}
        >
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={hi} stopOpacity={0} />
                <Stop offset="0.5" stopColor={hi} stopOpacity={peak} />
                <Stop offset="1" stopColor={hi} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={w} height={height} fill={`url(#${gid})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A loading region: one announcement for assistive tech, a shared shimmer for the
 * blocks inside. Use one per area that is waiting, not one per block.
 */
export function SkeletonGroup({
  children,
  label,
  style,
}: {
  children: React.ReactNode;
  /** What is loading, read out once. Defaults to "Loading". */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t: tr } = useTranslation(['common']);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label ?? tr('common:table.loading')} aria-busy style={style}>
      <ShimmerProvider>{children}</ShimmerProvider>
    </View>
  );
}

/** Lines of text; the last one shorter, as a paragraph's is. */
export function SkeletonText({
  lines = 2,
  height = 12,
  gap = 8,
  lastWidth = '60%',
}: {
  lines?: number;
  height?: number;
  gap?: number;
  lastWidth?: DimensionValue;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={height} width={i === lines - 1 && lines > 1 ? lastWidth : '100%'} radius={4} />
      ))}
    </View>
  );
}

/** Varies widths row to row, so a stack of placeholders reads as text rather than a grid. */
export const skeletonWidth = (i: number, base = 50, spread = 35): DimensionValue => `${base + ((i * 17) % spread)}%`;

/** Stands in for a `ListRow`: optional icon square, title and subtitle, a value on the right. */
export function SkeletonListRow({
  index = 0,
  icon = true,
  right = true,
  divider = true,
  indent = 0,
}: {
  index?: number;
  icon?: boolean;
  right?: boolean;
  divider?: boolean;
  indent?: number;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingLeft: t.spacing.lg + indent,
        minHeight: 56,
        borderBottomWidth: divider ? 0.5 : 0,
        borderBottomColor: t.c.line,
      }}
    >
      {icon ? <Skeleton height={36} width={36} radius={t.radius.sm} /> : null}
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton height={13} width={skeletonWidth(index, 45, 30)} radius={4} />
        <Skeleton height={10} width={skeletonWidth(index + 2, 25, 20)} radius={4} />
      </View>
      {right ? <Skeleton height={14} width={64} radius={4} /> : null}
    </View>
  );
}

/** Stands in for a `DocumentRow`: avatar, party and number, amount over a status badge. */
export function SkeletonDocumentRow({ index = 0, divider = true }: { index?: number; divider?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        borderBottomWidth: divider ? 0.5 : 0,
        borderBottomColor: t.c.line,
      }}
    >
      <Skeleton height={38} width={38} radius={19} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton height={13} width={skeletonWidth(index, 45, 30)} radius={4} />
        <Skeleton height={10} width={skeletonWidth(index + 3, 30, 20)} radius={4} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Skeleton height={14} width={72} radius={4} />
        <Skeleton height={16} width={48} radius={8} />
      </View>
    </View>
  );
}

/** A list of row placeholders. `kind` picks the row shape. */
export function SkeletonRows({ rows = 6, kind = 'list', icon = true }: { rows?: number; kind?: 'list' | 'document'; icon?: boolean }) {
  return (
    <View>
      {Array.from({ length: rows }, (_, i) =>
        kind === 'document' ? (
          <SkeletonDocumentRow key={i} index={i} divider={i < rows - 1} />
        ) : (
          <SkeletonListRow key={i} index={i} icon={icon} divider={i < rows - 1} />
        ),
      )}
    </View>
  );
}

/** Stands in for a `StatTile`: label, figure, caption, at the tile's own size. */
export function SkeletonStatTile({ flex = 1 }: { flex?: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex,
        minHeight: 96,
        padding: t.spacing.lg,
        gap: t.spacing.md,
        justifyContent: 'space-between',
        borderRadius: t.radius.lg,
        backgroundColor: t.c.card,
        borderWidth: WEB || t.scheme === 'dark' ? 1 : 0,
        borderColor: t.c.line,
      }}
    >
      <Skeleton height={11} width="55%" radius={4} />
      <Skeleton height={22} width="70%" radius={6} />
      <Skeleton height={9} width="40%" radius={4} />
    </View>
  );
}

/** A row of tile placeholders: two to a row on a phone, or `tiles` across when `across`. */
export function SkeletonStatGrid({ tiles = 4, across = false }: { tiles?: number; across?: boolean }) {
  const t = useTheme();
  const per = across ? tiles : 2;
  const rows = Array.from({ length: Math.ceil(tiles / per) }, (_, r) => Array.from({ length: per }, (_, c) => r * per + c).filter((i) => i < tiles));
  return (
    <View style={{ gap: t.spacing.md }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {r.map((k) => (
            <SkeletonStatTile key={k} />
          ))}
          {/* Keeps a lone last tile at half width, as the real grid does. */}
          {r.length < per ? Array.from({ length: per - r.length }, (_, k) => <View key={`f${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

/** Stands in for a `Card`: an optional title bar over a body of lines (or `children`). */
export function SkeletonCard({
  title = true,
  lines = 3,
  children,
  style,
}: {
  title?: boolean;
  lines?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          padding: t.spacing.lg,
          gap: t.spacing.md,
          borderRadius: t.radius.lg,
          backgroundColor: t.c.card,
          borderWidth: WEB || t.scheme === 'dark' ? 1 : 0,
          borderColor: t.c.line,
        },
        style,
      ]}
    >
      {title ? <Skeleton height={13} width="35%" radius={4} /> : null}
      {children ?? <SkeletonText lines={lines} />}
    </View>
  );
}

/** A chart's place: title bar and plot area. */
export function SkeletonChart({ height = 110 }: { height?: number }) {
  return (
    <SkeletonCard>
      <Skeleton height={height} radius={10} />
    </SkeletonCard>
  );
}

/**
 * A form field: label over an input. On a desktop the input is the real field's height (40, or 46
 * in Tamil), so the form doesn't jump when it loads; `maxWidth` matches a field capped with `fw()`.
 */
export function SkeletonFormField({ index = 0, maxWidth }: { index?: number; maxWidth?: number }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const input = desktop ? (t.script === 'tamil' ? 46 : 40) : 44;
  return (
    <View style={[{ gap: t.spacing.xs }, desktop && maxWidth ? { width: '100%', maxWidth } : null]}>
      <Skeleton height={10} width={skeletonWidth(index, 20, 20)} radius={4} />
      <Skeleton height={input} radius={t.radius.md} />
    </View>
  );
}

/** Label and value pairs, right aligned, as a totals panel or a summary block. */
export function SkeletonTotals({ rows = 3 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Skeleton height={i === rows - 1 ? 14 : 11} width={skeletonWidth(i, 25, 15)} radius={4} />
          <Skeleton height={i === rows - 1 ? 16 : 12} width={i === rows - 1 ? 96 : 72} radius={4} />
        </View>
      ))}
    </View>
  );
}

/** A table's rows: `cols` cells across, widths varied so it reads as text. */
export function SkeletonTable({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  const t = useTheme();
  return (
    <View>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            minHeight: 44,
            paddingHorizontal: t.spacing.md,
            borderBottomWidth: i < rows - 1 ? 0.5 : 0,
            borderBottomColor: t.c.line,
          }}
        >
          {Array.from({ length: cols }, (_, j) => (
            <View
              key={j}
              style={{
                flex: j === 0 ? 2 : 1,
                alignItems: j === 0 ? 'flex-start' : 'flex-end',
              }}
            >
              <Skeleton height={12} width={`${55 + ((i * 7 + j * 13) % 35)}%`} radius={4} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
