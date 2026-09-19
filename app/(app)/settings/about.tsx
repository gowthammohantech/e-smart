import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandLogo } from '@/components/BrandLogo';
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
          <BrandLogo height={64} />
          <Text variant="h3" weight="700">
            Elixir Books Smart
          </Text>
          <Badge label="Prototype build 1.0.0" tone="info" />
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>
            Sales and GST compliance from a phone — invoices, e-invoices and e-way bills, without ERP complexity.
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
            This is a UI prototype. Every screen runs on a seeded local dataset. The tax splits, the GSTIN check digit,
            the IRN hash, the cancellation windows and the e-way bill validity rules are real implementations — but both
            GST portals are local mocks, the QR is signed with a demo key rather than NIC&apos;s, and nothing is ever
            sent to a server.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
