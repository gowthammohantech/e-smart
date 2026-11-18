import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { PaymentForm } from '../../../features/payments/PaymentForm';
import { useAppStore } from '../../../store/appStore';
import { useHasModule } from '../../../store/selectors';

/**
 * Money paid to a supplier. Money received is a receipt now: a link here for it (an invoice's Record
 * payment, a contact's, an older bookmark) opens the Receipts entry with the same customer and invoice.
 */
export default function NewPayment() {
  // Keyed by business: on web the page stays open across a switch, and the form seeds its method and
  // account from the business it opened in.
  const companyId = useAppStore((s) => s.activeCompanyId);
  const params = useLocalSearchParams<{ direction?: string; partyId?: string; documentId?: string; advance?: string }>();
  // Paying suppliers is part of payables, which the Sales plan leaves out.
  const canPay = useHasModule('payables');
  if (params.direction === 'paid' && canPay) return <PaymentForm key={companyId} direction="paid" />;
  const carried = Object.fromEntries(Object.entries({ partyId: params.partyId, documentId: params.documentId, advance: params.advance }).filter(([, v]) => !!v)) as Record<string, string>;
  return <Redirect href={{ pathname: '/(app)/receipts/new', params: carried } as never} />;
}
