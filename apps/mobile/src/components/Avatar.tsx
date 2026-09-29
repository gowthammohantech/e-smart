import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { initialsOf } from '@/lib/format';

const PALETTE = ['#007AFF', '#34C88A', '#F0B429', '#FF6B6B', '#C77DFF', '#00C2C7', '#FF9F45', '#7AA2F7'];

export function Avatar({
  name,
  size = 40,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const t = useTheme();
  const hash = name.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const bg = color ?? PALETTE[hash % PALETTE.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${bg}22`,
        borderWidth: 1,
        borderColor: `${bg}55`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: bg, fontSize: size * 0.36, fontWeight: '700' }}>{initialsOf(name)}</Text>
      {t ? null : null}
    </View>
  );
}
