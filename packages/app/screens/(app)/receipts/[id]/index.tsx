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
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { AttachmentLinks } from '../../../../features/expenses/AttachmentLinks';

/** One receipt voucher: what it was for, where the money went, from whom; edit or delete it. */
export default function ReceiptDetail() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave } = useServerSave();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stored = useVouchers().find((v) => v.id === id);
  const remote = useVoucherRecord(id);
  const voucher = stored ?? (remote.data as typeof stored);
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const costCentres = useCostCentres(true);
  const partyQuery = usePartyRecord(voucher?.partyId);
  const party = useParties().find((p) => p.id === voucher?.partyId);
  const removeVoucher = useAppStore((s) => s.removeVoucher);
  const [confirm, setConfirm] = useState(false);

  // The chart names Source and Into: until it's in they'd show raw account keys.
  if ((!voucher && remote.isLoading) || (voucher && !loaded)) return <LoadingView />;
  if (!voucher || voucher.kind !== 'receipt') {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('books:receipts.title') }} />
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
  const attachmentIds = voucher.attachmentIds ?? [];
  // The party may still be on its way from the server: a bar, not a missing row.
  const partyPending = !!voucher.partyId && !party && partyQuery.isLoading;
  const rows: [string, string | undefined | React.ReactNode][] = [
    [tr('books:receipts.source'), label(source?.account)],
    [tr('books:receipts.into'), label(into?.account)],
    [tr('books:receipts.party'), partyPending ? <Skeleton key="party" height={12} width={110} radius={4} /> : party?.name],
    [tr('books:costCentres.field'), centre],
    [tr('books:vouchers.reference'), voucher.reference],
    [tr('books:vouchers.narration'), voucher.narration],
  ];
  const shown = rows.filter(([, v]) => !!v);
  const edit = () => router.push(`/(app)/receipts/${voucher.id}/edit` as never);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: voucher.number,
          // A desktop keeps the page actions together, top right, as an expense or a payment does.
          headerRight: desktop
            ? () => (
                <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  <Button title={tr('books:vouchers.delete')} variant="danger" icon="trash-can-outline" onPress={() => setConfirm(true)} />
                  <Button title={tr('books:vouchers.edit')} icon="pencil-outline" onPress={edit} />
                </View>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxxl : 140 + insets.bottom, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
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
            <ListRow key={k} title={k} right={typeof v === 'string' ? <Text variant="small" weight="600">{v}</Text> : v} divider={i < shown.length - 1} />
          ))}
        </Card>
        {attachmentIds.length ? (
          <Card style={{ gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">
              {tr('books:receipts.attachments')}
            </Text>
            <AttachmentLinks ids={attachmentIds} />
          </Card>
        ) : null}
      </ScrollView>
      {desktop ? null : (
        // On a phone, a bar at the bottom: edit, then delete, as an expense has them.
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
            flexDirection: 'row',
            gap: t.spacing.md,
          }}
        >
          <Button title={tr('books:vouchers.edit')} icon="pencil-outline" style={{ flex: 1 }} onPress={edit} />
          <Button title={tr('books:vouchers.delete')} variant="danger" icon="trash-can-outline" style={{ flex: 1 }} onPress={() => setConfirm(true)} />
        </View>
      )}
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
