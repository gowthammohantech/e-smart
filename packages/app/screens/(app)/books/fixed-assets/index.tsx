import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Segmented } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { KeyFigures } from '../../../../features/reports/reportParts';
import { useCanWrite } from '../../../../remote/connectivity';
import { useFixedAssets, type FixedAsset } from '../../../../remote/fixedAssets';
import { useBaseCurrency } from '../../../../store/selectors';

type Show = 'active' | 'disposed' | 'all';

/** The fixed asset register: what the business owns, what it cost and what it stands at today. */
export default function FixedAssets() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  const currency = useBaseCurrency();
  const canWrite = useCanWrite();
  const [show, setShow] = useState<Show>('active');
  const list = useFixedAssets(show === 'all' ? undefined : show);
  const assets = list.data ?? [];
  const sum = (pick: (a: FixedAsset) => number) => formatMoney(money(assets.reduce((s, a) => s + pick(a), 0), currency));
  const how = (a: FixedAsset) => (a.method === 'wdv' ? tr('books:assets.wdvShort', { rate: a.rate }) : tr('books:assets.slmShort', { years: +((a.lifeMonths ?? 0) / 12).toFixed(2) }));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:assets.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('books:assets.intro')}
        </Text>
        <Segmented options={(['active', 'disposed', 'all'] as const).map((v) => ({ value: v, label: tr(`books:assets.show.${v}`) }))} value={show} onChange={(v) => setShow(v as Show)} />
        <Card padded={false}>
          <ListRow title={tr('books:assets.schedule')} subtitle={tr('books:assets.scheduleHint')} icon="table-large" chevron onPress={() => router.push('/(app)/books/fixed-assets/schedule' as never)} />
        </Card>
        {list.isPending ? (
          <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
        ) : assets.length ? (
          <>
            <KeyFigures
              rows={[
                { label: tr('books:assets.totalCost'), value: sum((a) => a.cost.minor) },
                { label: tr('books:assets.totalWritten'), value: sum((a) => a.accumulatedDepreciation?.minor ?? 0) },
                { label: tr('books:assets.totalValue'), value: sum((a) => a.bookValue?.minor ?? 0), tone: 'good' },
              ]}
            />
            <Card padded={false}>
              {assets.map((a, i) => (
                <ListRow
                  key={a.id}
                  title={a.name}
                  subtitle={[a.assetCode, a.category, how(a), a.status === 'disposed' ? tr('books:assets.disposedOnShort', { date: formatDate(a.disposedOn!) }) : tr('books:assets.inUseShort', { date: formatDate(a.inUseFrom) })].filter(Boolean).join(' · ')}
                  right={
                    <Text variant="small" weight="600" tone={a.status === 'disposed' ? 'muted' : undefined}>
                      {formatMoney(a.bookValue ?? money(0, currency))}
                    </Text>
                  }
                  icon={a.status === 'disposed' ? 'archive-outline' : 'office-building-cog-outline'}
                  onPress={() => router.push(`/(app)/books/fixed-assets/${a.id}` as never)}
                  chevron
                  divider={i < assets.length - 1}
                />
              ))}
            </Card>
          </>
        ) : (
          <EmptyState icon="office-building-cog-outline" title={tr(`books:assets.empty.${show}`)} message={tr('books:assets.emptyBody')} />
        )}
      </ScrollView>
      {canWrite ? <PrimaryActionBar title={tr('books:assets.add')} icon="plus" onPress={() => router.push('/(app)/books/fixed-assets/new' as never)} /> : null}
    </View>
  );
}
