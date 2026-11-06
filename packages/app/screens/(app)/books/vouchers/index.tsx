import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { useVoucherPages } from '../../../../remote/queries';
import { useBaseCurrency } from '../../../../store/selectors';

export default function VoucherList() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  // From the server, newest first, 50 at a time.
  const [status, setStatus] = useState<'all' | 'draft' | 'posted'>('all');
  const pages = useVoucherPages(status === 'all' ? {} : { status });
  const vouchers = pages.rows;
  const baseCurrency = useBaseCurrency();
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: tr('books:hub.vouchers'),
          headerRight: () => <Button title={tr('books:journalImport.action')} icon="upload" variant="ghost" size="sm" onPress={() => router.push('/(app)/books/vouchers/import' as never)} />,
        }}
      />
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
        <Segmented
          options={(['all', 'draft', 'posted'] as const).map((v) => ({ value: v, label: tr(`books:vouchers.filter.${v}`) }))}
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
        />
      </View>
      {vouchers.length ? (
        <ScrollView
          contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
          // The next page loads before the end is reached, so scrolling rarely waits.
          onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600 && pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
          }}
          scrollEventThrottle={200}
        >
          <Card padded={false}>
            {vouchers.map((v, i) => (
              <ListRow
                key={v.id}
                title={v.status === 'draft' ? tr('books:vouchers.draftTitle') : v.number}
                subtitle={`${formatDate(v.date)} · ${tr(`books:vouchers.kind.${v.kind}`)}${v.narration ? ` · ${v.narration}` : ''}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {v.status === 'draft' ? <Badge label={tr('books:vouchers.draft')} tone="warning" size="sm" /> : null}
                    <Text variant="small" weight="600">
                      {formatMoney(money(v.lines.reduce((a, l) => a + l.debit.minor, 0), baseCurrency))}
                    </Text>
                  </View>
                }
                chevron
                divider={i < vouchers.length - 1}
                onPress={() => router.push(`/(app)/books/vouchers/${v.id}` as never)}
              />
            ))}
          </Card>
          {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} style={{ paddingVertical: t.spacing.md }} /> : null}
        </ScrollView>
      ) : pages.isLoading ? (
        <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
      ) : (
        <EmptyState icon="swap-horizontal" title={tr('books:vouchers.empty')} message={tr('books:vouchers.emptyBody')} actionLabel={tr('books:vouchers.new')} onAction={() => router.push('/(app)/books/vouchers/new')} />
      )}
      <Fab icon="plus" onPress={() => router.push('/(app)/books/vouchers/new')} />
    </View>
  );
}
