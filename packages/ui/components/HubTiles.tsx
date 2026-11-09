import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useBreakpoint } from '../theme/breakpoints';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';

export type HubTile = {
  key: string;
  label: string;
  icon: IconName;
  route: string;
  count?: number;
  tone?: 'default' | 'danger' | 'warning';
};

/** A hub tile on a desktop: an icon, a count and a label need no more. */
const HUB_TILE_WIDTH = 220;

export function HubTiles({ tiles }: { tiles: HubTile[] }) {
  const t = useTheme();
  const router = useRouter();
  const breakpoint = useBreakpoint();
  // Two across on a phone, filling the row; empty fillers complete the last
  // row so a lone tile doesn't stretch across it. A desktop gives each tile a
  // fixed width and as many fit in a row as the window allows.
  const phone = breakpoint === 'phone';
  const tileWidth = phone ? '47.5%' : HUB_TILE_WIDTH;
  const fillers = phone ? tiles.length % 2 : 0;

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
            flexGrow: phone ? 1 : 0,
            backgroundColor: hovered ? t.c.card2 : t.c.card,
            borderRadius: t.radius.lg,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            padding: t.spacing.lg,
            gap: t.spacing.md,
            opacity: pressed ? 0.75 : 1,
            // A borderless light tile needs its shadow to show where it ends.
            ...t.shadow.card,
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
              <Icon name={tile.icon} size={19} color={t.c.primary} />
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
      {Array.from({ length: fillers }, (_, i) => (
        <View key={`filler-${i}`} style={{ width: tileWidth, flexGrow: phone ? 1 : 0 }} />
      ))}
    </View>
  );
}
