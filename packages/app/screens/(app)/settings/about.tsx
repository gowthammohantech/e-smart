import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { ListRow } from '@esmart/ui/components/ListRow';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { appVersion } from '../../../lib/appVersion';
import { LEGAL } from '../../../lib/legal';
import { useToast } from '@esmart/ui/components/Toast';

export default function About() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const router = useRouter();
  const { label } = appVersion();
  const toast = useToast();
  // A phone with no browser or mail app set up can't open these: say so instead of doing nothing.
  const open = (url: string) => () => Linking.openURL(url).catch(() => toast.show(url.replace(/^mailto:/, ''), 'info', { icon: 'link-variant' }));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.about') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxl }}>
          <BrandLogo height={64} />
          <Text variant="h3" weight="700">{tr('settings:about.appName')}</Text>
          <Badge label={tr('settings:about.build', { version: label })} tone="info" />
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>{tr('settings:about.pitch')}</Text>
        </Card>

        <Card padded={false}>
          <ListRow title={tr('settings:about.version')} icon="information-outline" right={<Text variant="small" tone="muted">{label}</Text>} />
          <ListRow title={tr('settings:about.data')} icon="database-outline" right={<Text variant="small" tone="muted">{tr('settings:about.syncedData')}</Text>} divider={false} />
        </Card>

        <Card padded={false}>
          <ListRow title={tr('settings:about.privacy')} icon="shield-account-outline" chevron onPress={open(LEGAL.privacy)} />
          <ListRow title={tr('nav:more.entry.privacy')} icon="chart-box-outline" chevron onPress={() => router.push('/settings/privacy')} />
          <ListRow title={tr('settings:about.terms')} icon="file-document-outline" chevron onPress={open(LEGAL.terms)} />
          <ListRow title={tr('settings:about.support')} icon="lifebuoy" chevron onPress={open(LEGAL.support)} divider={false} />
        </Card>

        <Card variant="flat" style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:about.noteHeading')}</Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 19 }}>
            {tr('settings:about.note')}
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
