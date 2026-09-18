import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { DocStatus } from '@/types';
import { STATUS_META, StatusTone } from '@/domain/documentStates';

type Props = {
  label: string;
  tone?: StatusTone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone = 'neutral', icon, size = 'md', style }: Props) {
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
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={size === 'sm' ? 10 : 12} color={p.fg} /> : null}
      <Text
        style={{
          color: p.fg,
          fontSize: size === 'sm' ? t.fontSize.micro : t.fontSize.caption,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status, size = 'md' }: { status: DocStatus; size?: 'sm' | 'md' }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'neutral' as StatusTone };
  return <Badge label={meta.label} tone={meta.tone} size={size} />;
}
