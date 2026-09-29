import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { DocStatus } from '@esmart/core/types';
import { useTranslation } from 'react-i18next';
import { STATUS_TONE, StatusTone } from '@esmart/core/domain/documentStates';
import { statusLabel } from '@esmart/core/labels';

type Props = {
  label: string;
  tone?: StatusTone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  size?: 'sm' | 'md';
  /** A count bubble: round for one digit, centred in its row, never squeezed. */
  count?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone = 'neutral', icon, size = 'md', count, style }: Props) {
  const t = useTheme();
  const map: Record<StatusTone, { bg: string; fg: string }> = {
    neutral: { bg: t.c.mutedSoft, fg: t.c.muted },
    info: { bg: t.c.chip, fg: t.c.primary },
    success: { bg: t.c.goodSoft, fg: t.c.good },
    warning: { bg: t.c.warnSoft, fg: t.c.warn },
    danger: { bg: t.c.badSoft, fg: t.c.bad },
  };
  const p = map[tone];
  return (
    <View
      style={[
        {
          backgroundColor: p.bg,
          borderRadius: t.radius.pill,
          paddingHorizontal: size === 'sm' ? 7 : 10,
          paddingVertical: size === 'sm' ? 2 : 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: count ? 'center' : 'flex-start',
          flexShrink: count ? 0 : 1,
          ...(count ? { minWidth: size === 'sm' ? 20 : 24, justifyContent: 'center' as const } : null),
        },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={size === 'sm' ? 10 : 12} color={p.fg} /> : null}
      <Text
        numberOfLines={1}
        style={{
          color: p.fg,
          fontSize: size === 'sm' ? t.fontSize.micro : t.fontSize.caption,
          fontWeight: '600',
          flexShrink: 1,
          textAlign: count ? 'center' : undefined,
          fontVariant: count ? ['tabular-nums'] : undefined,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status, size = 'md' }: { status: DocStatus; size?: 'sm' | 'md' }) {
  const { t } = useTranslation('domain');
  return <Badge label={statusLabel(t, status)} tone={STATUS_TONE[status] ?? 'neutral'} size={size} />;
}
