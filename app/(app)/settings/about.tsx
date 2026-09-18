import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ListRow } from '@/components/ListRow';
import { ILLUSTRATION_CREDIT } from '@/illustrations/registry';

export default function About() {
  const t = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'About' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxl }}>
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: t.radius.lg,
              backgroundColor: t.c.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="chart-box-outline" size={32} color={t.c.onPrimary} />
          </View>
          <Text variant="h3" weight="700">
            Elixir Books Smart
          </Text>
          <Badge label="Prototype build 1.0.0" tone="info" />
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>
            Everyday business management from a phone — invoices, payments, purchases and stock, without ERP complexity.
          </Text>
        </Card>

        <Card padded={false}>
          <ListRow title="Version" icon="information-outline" right={<Text variant="small" tone="muted">1.0.0 (1)</Text>} />
          <ListRow title="Platform" icon="cellphone" right={<Text variant="small" tone="muted">Expo SDK 57</Text>} />
          <ListRow title="Data" icon="database-outline" right={<Text variant="small" tone="muted">Local demo data</Text>} divider={false} />
        </Card>

        <Card padded={false}>
          <ListRow
            title={ILLUSTRATION_CREDIT.label}
            subtitle="Free illustrations, used under the Storyset licence"
            icon="palette-outline"
            chevron
            onPress={() => Linking.openURL(ILLUSTRATION_CREDIT.url).catch(() => {})}
          />
          <ListRow title="Privacy policy" icon="shield-account-outline" chevron onPress={() => Linking.openURL('https://example.com/privacy').catch(() => {})} />
          <ListRow title="Terms of service" icon="file-document-outline" chevron onPress={() => Linking.openURL('https://example.com/terms').catch(() => {})} />
          <ListRow title="Contact support" icon="lifebuoy" chevron onPress={() => Linking.openURL('mailto:support@example.com').catch(() => {})} divider={false} />
        </Card>

        <Card variant="flat" style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            A note on this build
          </Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 19 }}>
            This is a UI prototype. Every screen is driven by a seeded local dataset — calculations, tax splits, stock
            movements and aging are real, but nothing is sent to a server and no compliance filing actually happens.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
