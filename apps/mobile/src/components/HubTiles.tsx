import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
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

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.key}
          onPress={() => router.push(tile.route as never)}
          accessibilityRole="button"
          accessibilityLabel={`${tile.label}${tile.count !== undefined ? `, ${tile.count}` : ''}`}
          style={({ pressed }) => ({
            width: '47.5%',
            flexGrow: 1,
            backgroundColor: t.c.card,
            borderRadius: t.radius.lg,
            borderWidth: t.scheme === 'dark' ? 1 : 0,
            borderColor: t.c.line,
            padding: t.spacing.lg,
            gap: t.spacing.md,
            opacity: pressed ? 0.75 : 1,
          })}
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
    </View>
  );
}
