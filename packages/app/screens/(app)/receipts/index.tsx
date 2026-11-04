import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { ListRow } from '@esmart/ui/components/ListRow';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, inRange, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { dateRangeLabel } from '@esmart/core/labels';
import type { Voucher } from '@esmart/core/types';
import { useBooks, useVouchers } from '../../../store/books';
import { useBaseCurrency } from '../../../store/selectors';
import { presetParam, useQueryParams } from '../../../navigation/queryParams';
import { useAccountName } from '../../../features/books/names';

const DEFAULT_RANGE: DateRangePreset = 'last30';

/** What a receipt is for: the account it credits (an income, a loan, capital). */
export const incomeLine = (v: Voucher) => v.lines.find((l) => l.credit.minor > 0);
const amountOf = (v: Voucher) => v.lines.reduce((a, l) => a + l.debit.minor, 0);

/** Money in that isn't from an invoice, laid out like Expenses: by period, with what it was for. */
export default function ReceiptsList() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common']);
  const baseCurrency = useBaseCurrency();
  const vouchers = useVouchers();
  const { book } = useBooks();
  const nameOf = useAccountName();
  const [params, setParams] = useQueryParams();
  const range = presetParam(params.range, DEFAULT_RANGE);

  const receipts = useMemo(() => {
    const r = resolveRange(range);
    return vouchers.filter((v) => v.kind === 'receipt' && (range === 'all' || inRange(v.date, r)));
  }, [vouchers, range]);
  const label = (key?: string) => {
    const a = key ? accountFor(key, book) : undefined;
    return a ? nameOf(a) : '—';
  };
  const byAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of receipts) {
      const key = incomeLine(v)?.account ?? '';
      map.set(key, (map.get(key) ?? 0) + amountOf(v));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [receipts]);
  const total = receipts.reduce((a, v) => a + amountOf(v), 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:receipts.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm }}>
          {DATE_RANGE_PRESET_KEYS.map((p) => {
            const active = range === p;
            return (
              <Pressable
                key={p}
                onPress={() => setParams({ range: p === DEFAULT_RANGE ? undefined : p })}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ paddingHorizontal: t.spacing.md, paddingVertical: 6, borderRadius: t.radius.pill, backgroundColor: active ? t.c.primary : t.c.card, borderWidth: active ? 0 : 1, borderColor: t.c.line }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
                  {dateRangeLabel(tr, p)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <StatRow>
          <StatTile label={tr('books:receipts.total')} value={money(total, baseCurrency)} caption={tr('books:receipts.count', { count: receipts.length })} />
        </StatRow>
        {byAccount.length > 1 ? (
          <Card padded={false}>
            {byAccount.map(([key, minor], i) => (
              <ListRow key={key} title={label(key)} right={<Text variant="small" weight="600">{formatMoney(money(minor, baseCurrency))}</Text>} divider={i < byAccount.length - 1} />
            ))}
          </Card>
        ) : null}
        {receipts.length ? (
          <Card padded={false}>
            {receipts.map((v, i) => (
              <ListRow
                key={v.id}
                title={label(incomeLine(v)?.account)}
                subtitle={`${v.number} · ${formatDate(v.date)}${v.narration ? ` · ${v.narration}` : ''}`}
                right={
                  <Text variant="small" weight="600" tone="good">
                    {formatMoney(money(amountOf(v), baseCurrency))}
                  </Text>
                }
                chevron
                divider={i < receipts.length - 1}
                onPress={() => router.push(`/(app)/books/vouchers/${v.id}` as never)}
              />
            ))}
          </Card>
        ) : (
          <EmptyState icon="cash-plus" title={tr('books:receipts.empty')} message={tr('books:receipts.emptyBody')} actionLabel={tr('books:receipts.new')} onAction={() => router.push('/(app)/receipts/new' as never)} compact />
        )}
      </ScrollView>
      <Fab icon="plus" onPress={() => router.push('/(app)/receipts/new' as never)} />
    </View>
  );
}
