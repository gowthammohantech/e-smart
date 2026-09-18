import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { Illustration } from './Illustration';
import { IllustrationName } from '@/illustrations/registry';

export function EmptyState({
  icon = 'inbox-outline',
  illustration,
  title,
  message,
  actionLabel,
  onAction,
  compact,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Shown instead of the icon. Small in-sheet states are better off with the icon. */
  illustration?: IllustrationName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? t.spacing.xxl : t.spacing.xxxl * 1.2, gap: t.spacing.md }}>
      {illustration ? (
        <Illustration name={illustration} size={compact ? 'compact' : 'full'} />
      ) : (
        <View
          style={{
            width: compact ? 52 : 68,
            height: compact ? 52 : 68,
            borderRadius: compact ? 26 : 34,
            backgroundColor: t.c.card2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={icon} size={compact ? 24 : 32} color={t.c.muted} />
        </View>
      )}
      <Text variant={compact ? 'body' : 'title'} weight="600" center>
        {title}
      </Text>
      {message ? (
        <Text variant="small" tone="muted" center style={{ maxWidth: 280, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} size="sm" variant="secondary" /> : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 8 }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const t = useTheme();
  return <View style={{ height, width, borderRadius: radius, backgroundColor: t.c.card2 }} />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md, paddingVertical: t.spacing.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Skeleton height={38} width={38} radius={19} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={13} width="62%" />
            <Skeleton height={11} width="38%" />
          </View>
          <Skeleton height={16} width={64} />
        </View>
      ))}
    </View>
  );
}
