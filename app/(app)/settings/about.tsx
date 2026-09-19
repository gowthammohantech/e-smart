import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t: tr } = useTranslation(['nav', 'settings']);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.about') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxl }}>
          <BrandLogo height={64} />
          <Text variant="h3" weight="700">{tr('settings:about.appName')}</Text>
          <Badge label={tr('settings:about.build', { version: '1.0.0' })} tone="info" />
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>{tr('settings:about.pitch')}</Text>
        </Card>

        <Card padded={false}>
          <ListRow title={tr('settings:about.version')} icon="information-outline" right={<Text variant="small" tone="muted">1.0.0 (1)</Text>} />
          <ListRow title={tr('settings:about.platform')} icon="cellphone" right={<Text variant="small" tone="muted">{tr('settings:about.sdk')}</Text>} />
          <ListRow title={tr('settings:about.data')} icon="database-outline" right={<Text variant="small" tone="muted">{tr('settings:about.localData')}</Text>} divider={false} />
        </Card>

        <Card padded={false}>
          <ListRow
            title={ILLUSTRATION_CREDIT.label}
            subtitle={tr('settings:about.illustrations')}
            icon="palette-outline"
            chevron
            onPress={() => Linking.openURL(ILLUSTRATION_CREDIT.url).catch(() => {})}
          />
          <ListRow title={tr('settings:about.privacy')} icon="shield-account-outline" chevron onPress={() => Linking.openURL('https://example.com/privacy').catch(() => {})} />
          <ListRow title={tr('settings:about.terms')} icon="file-document-outline" chevron onPress={() => Linking.openURL('https://example.com/terms').catch(() => {})} />
          <ListRow title={tr('settings:about.support')} icon="lifebuoy" chevron onPress={() => Linking.openURL('mailto:support@example.com').catch(() => {})} divider={false} />
        </Card>

        <Card variant="flat" style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:about.noteHeading')}</Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 19 }}>
            This is a UI prototype. Every screen is driven by a seeded local dataset — calculations, tax splits, stock
            movements and aging are real, but nothing is sent to a server and no compliance filing actually happens.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
