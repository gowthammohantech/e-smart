import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import type { IconName } from '@esmart/ui/components/Icon';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const LINKS: { key: 'accounts' | 'vouchers' | 'costCentres' | 'trialBalance' | 'profitLoss' | 'balanceSheet' | 'dayBook' | 'integrity' | 'close'; route: string; icon: IconName }[] = [
  { key: 'accounts', route: '/(app)/books/accounts', icon: 'format-list-bulleted-type' },
  { key: 'vouchers', route: '/(app)/books/vouchers', icon: 'swap-horizontal' },
  { key: 'costCentres', route: '/(app)/books/cost-centres', icon: 'sitemap-outline' },
  { key: 'trialBalance', route: '/(app)/books/trial-balance', icon: 'scale-balance' },
  { key: 'profitLoss', route: '/(app)/books/profit-loss', icon: 'chart-line' },
  { key: 'balanceSheet', route: '/(app)/books/balance-sheet', icon: 'file-table-outline' },
  { key: 'dayBook', route: '/(app)/books/day-book', icon: 'calendar-text-outline' },
  { key: 'integrity', route: '/(app)/books/integrity', icon: 'shield-check-outline' },
  { key: 'close', route: '/(app)/books/close', icon: 'lock-outline' },
];

/** The books: the general ledger the app keeps from everything recorded, and the statements from it. */
export default function BooksHub() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:hub.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('books:hub.subtitle')}
        </Text>
        <Card padded={false}>
          {LINKS.map((l, i) => (
            <ListRow
              key={l.key}
              title={tr(`books:hub.${l.key}`)}
              subtitle={tr(`books:hub.${l.key}Hint`)}
              icon={l.icon}
              chevron
              divider={i < LINKS.length - 1}
              onPress={() => router.push(l.route as never)}
            />
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}
