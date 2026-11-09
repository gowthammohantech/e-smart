import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { useVoucherPages, type VoucherQuery } from '../../../../remote/queries';
import { useBaseCurrency } from '../../../../store/selectors';
import { ListSkeleton, MoreRowsSkeleton } from '../../../../components/ScreenSkeleton';
import { pagedTableProps } from '../../../../components/pagedTable';

export default function VoucherList() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'reports', 'common']);
  // From the server, newest first, 50 at a time.
  const [status, setStatus] = useState<'all' | 'draft' | 'posted'>('all');
  // `?kind=contra` (the transfer entry's "all transfers") lists one kind.
  const KINDS = ['journal', 'contra', 'gstJournal', 'tdsChallan', 'receipt', 'gstChallan'] as const;
  const kindParam = useLocalSearchParams<{ kind?: string }>().kind;
  const kind = (KINDS as readonly string[]).includes(String(kindParam)) ? (kindParam as VoucherQuery['kind']) : undefined;
  const pages = useVoucherPages({ ...(status === 'all' ? {} : { status }), kind });
  const vouchers = pages.rows;
  const baseCurrency = useBaseCurrency();
  const amountOf = (v: (typeof vouchers)[number]) => formatMoney(money(v.lines.reduce((a, l) => a + l.debit.minor, 0), baseCurrency));
  const open = (v: (typeof vouchers)[number]) => router.push(`/(app)/books/vouchers/${v.id}` as never);
  const empty = <EmptyState icon="swap-horizontal" title={tr('books:vouchers.empty')} message={tr('books:vouchers.emptyBody')} actionLabel={tr('books:vouchers.new')} onAction={() => router.push('/(app)/books/vouchers/new')} />;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: kind ? `${tr('books:hub.vouchers')} · ${tr(`books:vouchers.kind.${kind}`)}` : tr('books:hub.vouchers'),
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
      {desktop ? (
        // A desktop lists vouchers as a table: number, date, kind and narration in columns, the amount beside them.
        <View style={{ flex: 1, padding: t.spacing.lg }}>
          <DataTable
            columns={[
              { key: 'number', header: tr('common:table.number'), width: 150, render: (v) => <Cell weight="600">{v.status === 'draft' ? tr('books:vouchers.draftTitle') : v.number}</Cell> },
              { key: 'date', header: tr('common:table.date'), width: 120, render: (v) => <Cell tone="muted">{formatDate(v.date)}</Cell> },
              { key: 'kind', header: tr('common:table.type'), width: 150, render: (v) => <Cell>{tr(`books:vouchers.kind.${v.kind}`)}</Cell> },
              { key: 'narration', header: tr('books:vouchers.narration'), flex: 2, secondary: true, render: (v) => <Cell tone="muted">{v.narration || '—'}</Cell> },
              { key: 'status', header: tr('common:table.status'), width: 110, render: (v) => (v.status === 'draft' ? <Badge label={tr('books:vouchers.draft')} tone="warning" size="sm" /> : null) },
              { key: 'amount', header: tr('common:table.amount'), width: 150, align: 'right', render: (v) => <Cell weight="600" mono>{amountOf(v)}</Cell> },
            ]}
            rows={vouchers}
            rowKey={(v) => v.id}
            onRowPress={open}
            rowLabel={(v) => `${v.number || tr('books:vouchers.draftTitle')}, ${amountOf(v)}`}
            {...pagedTableProps(pages, tr('common:table.loadFailed'), 'vouchers')}
            empty={empty}
          />
        </View>
      ) : vouchers.length ? (
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
          {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : null}
        </ScrollView>
      ) : pages.isLoading ? (
        <ListSkeleton kind="list" />
      ) : pages.isError ? (
        // A failed fetch isn't "no vouchers yet".
        <EmptyState icon="cloud-off-outline" title={tr('reports:dash.state.failedTitle')} message={tr('reports:dash.state.failedBody')} actionLabel={tr('reports:dash.state.retry')} onAction={() => void pages.refetch()} />
      ) : (
        empty
      )}
      <Fab icon="plus" onPress={() => router.push('/(app)/books/vouchers/new')} />
    </View>
  );
}
