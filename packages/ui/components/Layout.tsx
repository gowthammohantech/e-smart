import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { FORM_MAX_WIDTH, STAT_TILE_MAX_WIDTH, WIDE_FORM_MAX_WIDTH, useIsDesktop } from '../theme/breakpoints';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Two columns side by side on a desktop browser; on a phone the left column
 * simply comes first, so screens keep their mobile reading order. `ratio`
 * shares the width unevenly, e.g. [3, 2] for charts beside a list.
 */
export function Columns({ left, right, ratio = [1, 1] }: { left: React.ReactNode; right: React.ReactNode; ratio?: [number, number] }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  if (!desktop) {
    return (
      <>
        {left}
        {right}
      </>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xl }}>
      <View style={{ flex: ratio[0], minWidth: 0 }}>{left}</View>
      <View style={{ flex: ratio[1], minWidth: 0 }}>{right}</View>
    </View>
  );
}

/**
 * Stacks its children (usually StatRows) on a phone and lays them out in one
 * line on a desktop, so four stat tiles sit across instead of in pairs.
 */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  return (
    <View style={{ flexDirection: desktop ? 'row' : 'column', gap: t.spacing.md }}>
      {/* Each group holds a pair of tiles at most: one or two groups don't stretch across the page. */}
      {React.Children.map(children, (child) =>
        child && desktop ? <View style={{ flex: 1, maxWidth: STAT_TILE_MAX_WIDTH * 2 + t.spacing.md }}>{child}</View> : child,
      )}
    </View>
  );
}

/**
 * Keeps a form at a readable width on a desktop instead of stretching across
 * the content column, lined up under the page title at the left. A no-op on phones.
 */
export function FormContainer({
  children,
  wide = false,
  style,
}: {
  children: React.ReactNode;
  /** Long multi-section forms get a little more room. */
  wide?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const desktop = useIsDesktop();
  if (!desktop) return <View style={[{ flex: 1 }, style]}>{children}</View>;
  return (
    <View style={[{ flex: 1, width: '100%', maxWidth: wide ? WIDE_FORM_MAX_WIDTH : FORM_MAX_WIDTH, alignSelf: 'flex-start' }, style]}>
      {children}
    </View>
  );
}

/**
 * Form fields side by side on a desktop, stacked on a phone. On a phone it
 * adds no wrapper, so the fields keep the parent column's spacing.
 *
 * Every child slot keeps its column on a desktop, shown or not: a row of a date and a due date
 * that hides the due date leaves the date at half the row, not stretched across it. `columns`
 * sets the count when the children don't say it (e.g. a single field meant for a third).
 */
export function FieldRow({ children, columns }: { children: React.ReactNode; columns?: number }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  if (!desktop) return <>{children}</>;
  // Children.count counts null and false slots too, which is what holds a hidden field's place.
  const slots = Math.max(columns ?? 0, React.Children.count(children));
  const shown = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.lg }}>
      {shown.map((child, i) => (
        <View key={i} style={{ flex: 1, minWidth: 0 }}>
          {child}
        </View>
      ))}
      {Array.from({ length: Math.max(0, slots - shown.length) }, (_, i) => (
        <View key={`gap-${i}`} style={{ flex: 1 }} />
      ))}
    </View>
  );
}

/**
 * A titled card grouping related fields, for desktop form layouts. `action`
 * sits at the right of the title (e.g. a pair of text links).
 */
export function FormSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.md }}>
        <Text variant="caption" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </Card>
  );
}

/**
 * A main area with a side column beside it on a desktop (summaries, status,
 * actions); stacked, main first, on a phone.
 */
export function SplitPane({
  main,
  side,
  sideWidth = 340,
  style,
  stickySide,
}: {
  main: React.ReactNode;
  /** Nothing here gives the main area the full width. */
  side?: React.ReactNode;
  sideWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Web: the side column stays in view while the main one scrolls (a summary beside a long form). */
  stickySide?: boolean;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  if (!desktop) {
    return (
      <View style={[{ gap: t.spacing.lg }, style]}>
        {main}
        {side}
      </View>
    );
  }
  return (
    <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xl }, style]}>
      <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>{main}</View>
      {side ? (
        <View
          style={[
            { width: sideWidth, gap: t.spacing.lg },
            // RN's types don't list 'sticky'; react-native-web passes it through to CSS.
            stickySide && Platform.OS === 'web' ? ({ position: 'sticky', top: t.spacing.lg } as unknown as ViewStyle) : null,
          ]}
        >
          {side}
        </View>
      ) : null}
    </View>
  );
}
