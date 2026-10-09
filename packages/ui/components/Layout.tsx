import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { FORM_MAX_WIDTH, WIDE_FORM_MAX_WIDTH, useIsDesktop } from '../theme/breakpoints';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Two columns side by side on a desktop browser; on a phone the left column
 * simply comes first, so screens keep their mobile reading order.
 */
export function Columns({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
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
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
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
      {React.Children.map(children, (child) =>
        child && desktop ? <View style={{ flex: 1 }}>{child}</View> : child,
      )}
    </View>
  );
}

/**
 * Keeps a form at a readable width on a desktop instead of stretching across
 * the content column. A no-op on phones.
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
    <View style={[{ flex: 1, width: '100%', maxWidth: wide ? WIDE_FORM_MAX_WIDTH : FORM_MAX_WIDTH, alignSelf: 'center' }, style]}>
      {children}
    </View>
  );
}

/**
 * Form fields side by side on a desktop, stacked on a phone. On a phone it
 * adds no wrapper, so the fields keep the parent column's spacing.
 */
export function FieldRow({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  if (!desktop) return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.lg }}>
      {React.Children.map(children, (child) => (child ? <View style={{ flex: 1, minWidth: 0 }}>{child}</View> : null))}
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
}: {
  main: React.ReactNode;
  /** Nothing here gives the main area the full width. */
  side?: React.ReactNode;
  sideWidth?: number;
  style?: StyleProp<ViewStyle>;
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
      {side ? <View style={{ width: sideWidth, gap: t.spacing.lg }}>{side}</View> : null}
    </View>
  );
}
