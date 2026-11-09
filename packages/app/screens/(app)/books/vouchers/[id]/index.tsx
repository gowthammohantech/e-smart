import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ApiError } from '@esmart/api-client';
import { useServerSave } from '../../../../../components/useServerSave';
import { useAppStore } from '../../../../../store/appStore';
import { useCostCentres, useVouchers } from '../../../../../store/books';
import { useServerBook, useVoucherRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';
import { useAccountName } from '../../../../../features/books/names';

const AMOUNT_W = 104;

export default function VoucherDetail() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common', 'reports']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const { id } = useLocalSearchParams<{ id: string }>();
  const voucher = useVouchers().find((v) => v.id === id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useVoucherRecord(id);
  // The chart the server names accounts from: the device needn't hold every party.
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const removeVoucher = useAppStore((s) => s.removeVoucher);
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const [confirm, setConfirm] = useState(false);
  const costCentres = useCostCentres(true);

  // isPending, not isLoading: a query not yet started isn't "not found".
  if (!voucher && !!id && remote.isPending) return <LoadingView />;
  // Only a voucher the server says isn't there is "not found"; anything else failed to load.
  if (!voucher && remote.isError && !(remote.error instanceof ApiError && (remote.error.status === 404 || remote.error.status === 403))) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState icon="cloud-off-outline" title={tr('reports:dash.state.failedTitle')} message={tr('reports:dash.state.failedBody')} actionLabel={tr('reports:dash.state.retry')} onAction={() => void remote.refetch()} />
      </View>
    );
  }
  if (!voucher) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }
  // Without the chart its lines would read as raw account keys.
  if (!loaded) return <LoadingView title={voucher.status === 'draft' ? tr('books:vouchers.draftTitle') : voucher.number} />;
  const label = (key: string) => {
    const a = accountFor(key, book);
    return a ? nameOf(a) : nameOf({ key, name: key, kind: 'system' });
  };

  const isDraft = voucher.status === 'draft';
  const currency = voucher.lines[0]?.debit.currency ?? voucher.lines[0]?.credit.currency ?? 'INR';
  const totalDebit = voucher.lines.reduce((a, l) => a + l.debit.minor, 0);
  const totalCredit = voucher.lines.reduce((a, l) => a + l.credit.minor, 0);
  const title = isDraft ? tr('books:vouchers.draftTitle') : voucher.number;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={[{ padding: t.spacing.lg, gap: t.spacing.md }, desktop && { maxWidth: 880, width: '100%' }]} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Text variant="title" weight="700">
              {title}
            </Text>
            {isDraft ? <Badge label={tr('books:vouchers.draft')} tone="warning" size="sm" /> : null}
          </View>
          {isDraft ? (
            <Text variant="caption" tone="muted">
              {tr('books:vouchers.draftHint')}
            </Text>
          ) : null}
          <Text variant="small" tone="muted">
            {`${formatDate(voucher.date)} · ${tr(`books:vouchers.kind.${voucher.kind}`)}`}
          </Text>
          {voucher.narration ? <Text variant="body">{voucher.narration}</Text> : null}
          {voucher.reference ? (
            <Text variant="caption" tone="muted">
              {voucher.reference}
            </Text>
          ) : null}
        </Card>
        <Card style={{ gap: t.spacing.md }}>
          {/* As in a ledger: debits and credits each in their own column, totalled underneath. */}
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="700" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {tr('books:vouchers.account')}
            </Text>
            <Text variant="caption" tone="muted" weight="700" style={{ width: AMOUNT_W, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {tr('books:vouchers.debit')}
            </Text>
            <Text variant="caption" tone="muted" weight="700" style={{ width: AMOUNT_W, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {tr('books:vouchers.credit')}
            </Text>
          </View>
          {voucher.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{label(l.account)}</Text>
                {l.costCentreId ? (
                  <Text variant="caption" tone="muted">
                    {costCentres.find((c) => c.id === l.costCentreId)?.name ?? l.costCentreId}
                  </Text>
                ) : null}
                {l.narration ? (
                  <Text variant="caption" tone="muted">
                    {l.narration}
                  </Text>
                ) : null}
              </View>
              <Text variant="small" weight="600" style={{ width: AMOUNT_W, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {l.debit.minor ? formatMoney(l.debit) : ''}
              </Text>
              <Text variant="small" weight="600" style={{ width: AMOUNT_W, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {l.credit.minor ? formatMoney(l.credit) : ''}
              </Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: t.spacing.md, borderTopWidth: 1, borderTopColor: t.c.line, paddingTop: t.spacing.sm }}>
            <Text variant="small" weight="700" style={{ flex: 1 }}>
              {tr('books:vouchers.totals')}
            </Text>
            <Text variant="small" weight="700" style={{ width: AMOUNT_W, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {formatMoney(money(totalDebit, currency))}
            </Text>
            <Text variant="small" weight="700" style={{ width: AMOUNT_W, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {formatMoney(money(totalCredit, currency))}
            </Text>
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('books:vouchers.edit')} variant={isDraft ? 'secondary' : 'primary'} style={desktop ? undefined : { flex: 1 }} onPress={() => router.push(`/(app)/books/vouchers/${voucher.id}/edit` as never)} disabled={saving} />
          {isDraft ? (
            <Button
              title={tr('books:vouchers.post')}
              style={desktop ? undefined : { flex: 1 }}
              loading={saving}
              disabled={blocked}
              // The server checks it in full and says what's wrong if it can't be posted yet.
              onPress={() => void serverSave(() => saveVoucher({ ...voucher, status: 'posted' }), tr('books:vouchers.posted'), { icon: 'check' })}
            />
          ) : null}
        </View>
        {/* Deleting is set apart from the everyday actions, smaller and below them. */}
        <View style={{ alignItems: 'flex-start' }}>
          <Button title={tr('books:vouchers.delete')} icon="delete-outline" variant="danger" size="sm" onPress={() => setConfirm(true)} disabled={saving} />
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirm}
        title={tr('books:vouchers.deleteTitle', { number: title })}
        message={tr('books:vouchers.deleteMessage')}
        confirmLabel={tr('books:vouchers.delete')}
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          const res = await serverSave(() => removeVoucher(voucher.id), tr('books:vouchers.removed'), { icon: 'delete-outline' });
          if (res) router.replace('/(app)/books/vouchers');
        }}
      />
    </View>
  );
}
