import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { useServerSave } from '../../../../../components/useServerSave';
import { useAppStore } from '../../../../../store/appStore';
import { useBooks, useCostCentres, useVouchers } from '../../../../../store/books';
import { useAccountName } from '../../../../../features/books/names';

export default function VoucherDetail() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave } = useServerSave();
  const { id } = useLocalSearchParams<{ id: string }>();
  const voucher = useVouchers().find((v) => v.id === id);
  const { book } = useBooks();
  const nameOf = useAccountName();
  const removeVoucher = useAppStore((s) => s.removeVoucher);
  const [confirm, setConfirm] = useState(false);
  const costCentres = useCostCentres(true);

  if (!voucher) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }
  const label = (key: string) => {
    const a = accountFor(key, book);
    return a ? nameOf(a) : nameOf({ key, name: key, kind: 'system' });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: voucher.number }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.xs }}>
          <Text variant="title" weight="700">
            {voucher.number}
          </Text>
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
          {voucher.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="body">{label(l.account)}</Text>
                {l.costCentreId ? (
                  <Text variant="caption" tone="muted">
                    {costCentres.find((c) => c.id === l.costCentreId)?.name ?? l.costCentreId}
                  </Text>
                ) : null}
              </View>
              <Text variant="body" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                {l.debit.minor ? `${formatMoney(l.debit)} ${tr('books:accounts.dr')}` : `${formatMoney(l.credit)} ${tr('books:accounts.cr')}`}
              </Text>
            </View>
          ))}
        </Card>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button title={tr('books:vouchers.delete')} variant="danger" style={{ flex: 1 }} onPress={() => setConfirm(true)} />
          <Button title={tr('books:vouchers.edit')} style={{ flex: 1 }} onPress={() => router.push(`/(app)/books/vouchers/${voucher.id}/edit` as never)} />
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
          if (res) router.replace('/(app)/books/vouchers');
        }}
      />
    </View>
  );
}
