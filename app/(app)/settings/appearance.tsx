import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { StatRow, StatTile } from '@/components/StatTile';
import { useUiStore } from '@/store/uiStore';
import { ThemeMode } from '@/theme/ThemeProvider';
import { fromMajor } from '@/lib/money';
import { useBaseCurrency } from '@/store/selectors';

const MODES: { value: ThemeMode; label: string; description: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { value: 'system', label: 'Match device', description: 'Follows your phone’s light or dark setting.', icon: 'cellphone-cog' },
  { value: 'dark', label: 'Dark', description: 'The default look, easy on the eyes indoors.', icon: 'weather-night' },
  { value: 'light', label: 'Light', description: 'Higher contrast in bright sunlight.', icon: 'white-balance-sunny' },
];

export default function Appearance() {
  const t = useTheme();
  const baseCurrency = useBaseCurrency();
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Appearance' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {MODES.map((m, i) => {
            const active = themeMode === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setThemeMode(m.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={m.label}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < MODES.length - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                  backgroundColor: pressed ? t.c.card2 : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: active ? t.c.chip : t.c.mutedSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name={m.icon} size={19} color={active ? t.c.primary : t.c.muted} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="600">
                    {m.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {m.description}
                  </Text>
                </View>
                {active ? <MaterialCommunityIcons name="check-circle" size={20} color={t.c.primary} /> : null}
              </Pressable>
            );
          })}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Preview
        </Text>

        <StatRow>
          <StatTile label="Sales" value={fromMajor(482500, baseCurrency)} icon="trending-up" caption="12 invoices" />
          <StatTile label="Overdue" value={fromMajor(64300, baseCurrency)} tone="bad" icon="alert-circle-outline" caption="3 invoices" />
        </StatRow>

        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
            <Badge label="Paid" tone="success" />
            <Badge label="Partly paid" tone="warning" />
            <Badge label="Overdue" tone="danger" />
            <Badge label="Draft" tone="neutral" />
            <Badge label="Issued" tone="info" />
          </View>
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
            Status colours stay reserved for state, so they never double as chart series colours.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
