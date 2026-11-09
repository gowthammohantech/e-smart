import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { LoadingView } from '../../../../../components/LoadingView';
import { useAccountName } from '../../../../../features/books/names';
import { DataTable, KeyFigures, ReportSection } from '../../../../../features/reports/reportParts';
import { useCanWrite } from '../../../../../remote/connectivity';
import { useFixedAsset } from '../../../../../remote/fixedAssets';
import { useServerBook } from '../../../../../remote/queries';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';

/** One asset: what it cost, what has been written off, and its depreciation year by year. */
export default function FixedAssetDetail() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useFixedAsset(id);
  const canWrite = useCanWrite();
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const a = query.data;
  if (query.isError) return <EmptyState icon="alert-circle-outline" title={tr('books:assets.notFound')} />;
  if (!a) return <LoadingView />;
  const account = accountFor(a.account, book);
  const how = a.method === 'wdv' ? tr('books:assets.wdvShort', { rate: a.rate }) : tr('books:assets.slmShort', { years: +((a.lifeMonths ?? 0) / 12).toFixed(2) });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: a.name }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 80 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexWrap: 'wrap' }}>
            <Text variant="h3" style={{ flex: 1 }}>
              {a.name}
            </Text>
            <Badge label={tr(`books:assets.status.${a.status ?? 'active'}`)} tone={a.status === 'disposed' ? 'neutral' : 'success'} size="sm" />
          </View>
          {/* The account is named from the chart; until it's here, a shimmer rather than its raw key. */}
          {loaded ? (
            <Text variant="caption" tone="muted">
              {[a.assetCode, a.category, account ? nameOf(account) : a.account, how].filter(Boolean).join(' · ')}
            </Text>
          ) : (
            <SkeletonGroup>
              <Skeleton width={220} height={12} />
            </SkeletonGroup>
          )}
          <Text variant="caption" tone="muted">
            {tr('books:assets.dates', { acquired: formatDate(a.acquiredOn), inUse: formatDate(a.inUseFrom) })}
            {a.disposedOn ? ` · ${tr('books:assets.disposedOnShort', { date: formatDate(a.disposedOn) })}` : ''}
          </Text>
          {a.disposalNote ? <Text variant="small">{a.disposalNote}</Text> : null}
          {a.notes ? (
            <Text variant="small" tone="muted">
              {a.notes}
            </Text>
          ) : null}
        </Card>
        <KeyFigures
          rows={[
            { label: tr('books:assets.cost'), value: formatMoney(a.cost) },
            { label: tr('books:assets.writtenOff'), value: a.accumulatedDepreciation ? formatMoney(a.accumulatedDepreciation) : '—' },
            { label: tr('books:assets.bookValue'), value: a.bookValue ? formatMoney(a.bookValue) : '—', tone: 'good' },
          ]}
        />
        {canWrite ? <Button title={tr('books:assets.edit')} icon="pencil-outline" variant="secondary" onPress={() => router.push(`/(app)/books/fixed-assets/${a.id}/edit` as never)} /> : null}
        <ReportSection title={tr('books:assets.byYear')}>
          {a.years?.length ? (
            <DataTable
              headers={[tr('books:assets.year'), tr('books:assets.opening'), tr('books:assets.depreciation'), tr('books:assets.closing')]}
              rows={a.years.map((y) => [y.label, formatMoney(y.opening), formatMoney(y.depreciation), formatMoney(y.closing)])}
              widths={[1, 1.2, 1.2, 1.2]}
            />
          ) : (
            <Text variant="small" tone="muted">
              {tr('books:assets.noYears')}
            </Text>
          )}
        </ReportSection>
      </ScrollView>
    </View>
  );
}
