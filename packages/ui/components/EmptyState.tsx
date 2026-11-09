import React from 'react';
import { Animated, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { Text } from './Text';
import { Button } from './Button';
import { Illustration } from './Illustration';
import { IllustrationName } from '../illustrations/registry';
import { SkeletonGroup, SkeletonRows } from './Skeleton';
import { useEntrance, usePulse } from '../illustrations/motion';

export function EmptyState({
  icon = 'inbox-outline',
  illustration,
  title,
  message,
  actionLabel,
  onAction,
  compact,
}: {
  icon?: IconName;
  /** Shown instead of the icon. Small in-sheet states are better off with the icon. */
  illustration?: IllustrationName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const t = useTheme();
  const enter = useEntrance();
  // A phone's 280 wraps a desktop message into a narrow column of short lines.
  const desktop = useIsDesktop();
  return (
    <Animated.View style={[{ alignItems: 'center', paddingVertical: compact ? t.spacing.xxl : t.spacing.xxxl * 1.2, gap: t.spacing.md }, enter]}>
      {illustration ? (
        <Illustration name={illustration} size={compact ? 'compact' : 'full'} />
      ) : (
        <IconDisc icon={icon} compact={compact} />
      )}
      <Text variant={compact ? 'body' : 'title'} weight="600" center>
        {title}
      </Text>
      {message ? (
        <Text variant="small" tone="muted" center style={{ maxWidth: desktop ? 440 : 280, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} size="sm" variant="secondary" /> : null}
    </Animated.View>
  );
}

/** The icon on a tinted disc, with a soft halo that breathes around it. */
function IconDisc({ icon, compact }: { icon: IconName; compact?: boolean }) {
  const t = useTheme();
  const halo = usePulse({ min: 0.35, duration: 2400 });
  const d = compact ? 52 : 68;
  const ring = d + (compact ? 16 : 22);
  return (
    <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{ position: 'absolute', width: ring, height: ring, borderRadius: ring / 2, backgroundColor: t.c.chip, opacity: halo }}
      />
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: t.c.card2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={compact ? 24 : 32} color={t.c.primary} />
      </View>
    </View>
  );
}

/** Kept for older imports; the shimmer lives in `./Skeleton`. */
export { Skeleton } from './Skeleton';

/** Rows of avatar, two lines and an amount, as a list of documents loads. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonGroup>
      <SkeletonRows rows={rows} kind="document" />
    </SkeletonGroup>
  );
}
