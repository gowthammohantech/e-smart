import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useBreakpoint } from '../theme/breakpoints';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';

export type HubTile = {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  count?: number;
  tone?: 'default' | 'danger' | 'warning';
};

export function HubTiles({ tiles }: { tiles: HubTile[] }) {
  const t = useTheme();
  const router = useRouter();
  const breakpoint = useBreakpoint();
  // Two across on a phone, more as a desktop window widens. Empty fillers
  // complete the last row so a lone tile doesn't stretch across it.
  const columns = breakpoint === 'wide' ? 4 : breakpoint === 'phone' ? 2 : 3;
  const tileWidth = columns === 2 ? '47.5%' : columns === 3 ? '30%' : '22%';
  const fillers = (columns - (tiles.length % columns)) % columns;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          onPress={() => router.push(tile.route as never)}
          accessibilityRole="button"
          accessibilityLabel={`${tile.label}${tile.count !== undefined ? `, ${tile.count}` : ''}`}
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressState;
            return {
            width: tileWidth,
            flexGrow: 1,
            backgroundColor: hovered ? t.c.card2 : t.c.card,
            borderRadius: t.radius.lg,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            padding: t.spacing.lg,
            gap: t.spacing.md,
            opacity: pressed ? 0.75 : 1,
            ...focusRing(t, focused),
            };
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: t.radius.sm,
                backgroundColor: t.c.chip,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={tile.icon} size={19} color={t.c.primary} />
            </View>
            {tile.count !== undefined ? (
              <Text
                variant="h3"
                weight="700"
                tone={tile.tone === 'danger' ? 'bad' : tile.tone === 'warning' ? 'warn' : 'default'}
              >
                {tile.count}
              </Text>
            ) : null}
          </View>
          <Text variant="small" weight="600" numberOfLines={1}>
            {tile.label}
          </Text>
        </Pressable>
      ))}
      {breakpoint === 'phone'
        ? null
        : Array.from({ length: fillers }, (_, i) => <View key={`filler-${i}`} style={{ width: tileWidth, flexGrow: 1 }} />)}
    </View>
  );
}
