import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** Payments received are listed on Receipts now: an older link or bookmark lands there, on the customers' payments. */
export default function PaymentsReceived() {
  const params = useLocalSearchParams<{ range?: string; party?: string }>();
  const carried = Object.fromEntries(Object.entries({ type: 'payment', range: params.range, party: params.party }).filter(([, v]) => !!v)) as Record<string, string>;
  return <Redirect href={{ pathname: '/(app)/receipts', params: carried } as never} />;
}
