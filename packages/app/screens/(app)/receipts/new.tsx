import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ReceiptForm } from '../../../features/receipts/ReceiptForm';
import { PaymentForm } from '../../../features/payments/PaymentForm';
import type { ReceiptCarry } from '../../../features/receipts/ReceivedForSheet';
import { LoadingView } from '../../../components/LoadingView';
import { useServerBook } from '../../../remote/queries';
import { useAppStore } from '../../../store/appStore';
import { useHasModule } from '../../../store/selectors';

type Mode = { kind: 'customer'; partyId?: string } | { kind: 'account'; source?: string; sourceLabel?: string };

/**
 * A new receipt: what it was received for decides what it is. A customer is money against their
 * invoices, recorded as a payment received (applied to invoices, advances, TDS, a service advance's
 * GST); an income, another account or a supplier is a receipt voucher. Without the books (Free, Basic)
 * it is a customer's always. Opened for a customer or an invoice (`?partyId=`, `?documentId=`), or as
 * an advance receipt (`?advance=1`), it starts on the customer's side.
 */
export default function NewReceipt() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  const companyId = useAppStore((s) => s.activeCompanyId);
  const books = useHasModule('books');
  const params = useLocalSearchParams<{ partyId?: string; documentId?: string; advance?: string }>();
  const [mode, setMode] = useState<Mode>(() =>
    !books || params.partyId || params.documentId || params.advance === '1' ? { kind: 'customer', partyId: params.partyId } : { kind: 'account' },
  );
  /** What was typed before the form changed sides. */
  const [carry, setCarry] = useState<ReceiptCarry>({});
  // The pickers name accounts from the chart: until it's in they'd read "Pick account".
  const { loaded } = useServerBook();

  // Keyed by business (on web the page stays open across a switch) and by side, so each form starts fresh with what was carried.
  if (mode.kind === 'customer' || !books) {
    return (
      <PaymentForm
        key={`${companyId}:customer`}
        direction="received"
        receipts={{
          partyId: mode.kind === 'customer' ? mode.partyId : undefined,
          seed: carry,
          onPickAccount: (picked, next) => {
            setCarry(next);
            setMode({ kind: 'account', source: picked.key, sourceLabel: picked.label });
          },
        }}
      />
    );
  }
  if (!loaded) return <LoadingView variant="form" title={tr('books:receipts.new')} />;
  return (
    <>
      <Stack.Screen options={{ title: tr('books:receipts.new') }} />
      <ReceiptForm
        key={`${companyId}:account`}
        seed={carry}
        initialSource={mode.source}
        initialSourceLabel={mode.sourceLabel}
        onPickCustomer={(partyId, next) => {
          setCarry(next);
          setMode({ kind: 'customer', partyId });
        }}
        onSaved={(id) => router.replace(`/(app)/receipts/${id}` as never)}
      />
    </>
  );
}
