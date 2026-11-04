import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { useVouchers } from '../../../../store/books';
import { useBaseCurrency } from '../../../../store/selectors';

export default function VoucherList() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  const vouchers = useVouchers();
  const baseCurrency = useBaseCurrency();
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:hub.vouchers') }} />
      {vouchers.length ? (
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Card padded={false}>
            {vouchers.map((v, i) => (
              <ListRow
                key={v.id}
                title={v.number}
                subtitle={`${formatDate(v.date)} · ${tr(`books:vouchers.kind.${v.kind}`)}${v.narration ? ` · ${v.narration}` : ''}`}
                right={
                  <Text variant="small" weight="600">
                    {formatMoney(money(v.lines.reduce((a, l) => a + l.debit.minor, 0), baseCurrency))}
                  </Text>
                }
                chevron
                divider={i < vouchers.length - 1}
                onPress={() => router.push(`/(app)/books/vouchers/${v.id}` as never)}
              />
            ))}
          </Card>
        </ScrollView>
      ) : (
        <EmptyState icon="swap-horizontal" title={tr('books:vouchers.empty')} message={tr('books:vouchers.emptyBody')} actionLabel={tr('books:vouchers.new')} onAction={() => router.push('/(app)/books/vouchers/new')} />
      )}
      <Fab icon="plus" onPress={() => router.push('/(app)/books/vouchers/new')} />
    </View>
  );
}
