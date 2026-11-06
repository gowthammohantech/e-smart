import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { useServerSave } from '../../../../components/useServerSave';
import { LoadingView } from '../../../../components/LoadingView';
import { useAppStore } from '../../../../store/appStore';
import { useCostCentres, useVouchers } from '../../../../store/books';
import { useParties } from '../../../../store/selectors';
import { usePartyRecord, useServerBook, useVoucherRecord } from '../../../../remote/queries';
import { useAccountName } from '../../../../features/books/names';
import { receiptLines } from '../../../../features/receipts/ReceiptForm';

/** One receipt voucher: what it was for, where the money went, from whom; edit or delete it. */
export default function ReceiptDetail() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave } = useServerSave();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stored = useVouchers().find((v) => v.id === id);
  const remote = useVoucherRecord(id);
  const voucher = stored ?? (remote.data as typeof stored);
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const costCentres = useCostCentres(true);
  usePartyRecord(voucher?.partyId);
  const party = useParties().find((p) => p.id === voucher?.partyId);
  const removeVoucher = useAppStore((s) => s.removeVoucher);
  const [confirm, setConfirm] = useState(false);

  if (!voucher && remote.isLoading) return <LoadingView />;
  if (!voucher || voucher.kind !== 'receipt') {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState illustration="not-found" icon="cash-remove" title={tr('common:notFound.title')} />
      </View>
    );
  }
  const label = (key?: string) => {
    const a = key ? accountFor(key, book) : undefined;
    return a ? nameOf(a) : (key ?? '—');
  };
  const { into, source } = receiptLines(voucher);
  const centre = source?.costCentreId ? (costCentres.find((c) => c.id === source.costCentreId)?.name ?? source.costCentreId) : undefined;
  const attached = voucher.attachmentIds?.length ?? 0;
  const rows: [string, string | undefined][] = [
    [tr('books:receipts.source'), label(source?.account)],
    [tr('books:receipts.into'), label(into?.account)],
    [tr('books:receipts.party'), party?.name],
    [tr('books:costCentres.field'), centre],
    [tr('books:vouchers.reference'), voucher.reference],
    [tr('books:vouchers.narration'), voucher.narration],
    [tr('books:receipts.attachments'), attached ? tr('books:receipts.attached', { count: attached }) : undefined],
  ];
  const shown = rows.filter(([, v]) => !!v);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: voucher.number }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.xs }}>
          <Text variant="caption" tone="muted">
            {`${voucher.number} · ${formatDate(voucher.date)}`}
          </Text>
          <Text variant="display" weight="700" tone="good" style={{ fontVariant: ['tabular-nums'] }}>
            {into ? formatMoney(into.debit) : '—'}
          </Text>
        </Card>
        <Card padded={false}>
          {shown.map(([k, v], i) => (
            <ListRow key={k} title={k} right={<Text variant="small" weight="600">{v}</Text>} divider={i < shown.length - 1} />
          ))}
        </Card>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('books:vouchers.delete')} variant="danger" style={{ flex: 1 }} onPress={() => setConfirm(true)} />
          <Button title={tr('books:vouchers.edit')} style={{ flex: 1 }} onPress={() => router.push(`/(app)/receipts/${voucher.id}/edit` as never)} />
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirm}
        title={tr('books:vouchers.deleteTitle', { number: voucher.number })}
        message={tr('books:vouchers.deleteMessage')}
        confirmLabel={tr('books:vouchers.delete')}
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          const res = await serverSave(() => removeVoucher(voucher.id), tr('books:vouchers.removed'), { icon: 'delete-outline' });
          if (res) router.replace('/(app)/receipts' as never);
        }}
      />
    </View>
  );
}
