import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@esmart/ui/components/Button';
import { AgingScreen } from '../../features/ledger/AgingScreen';

export default function Payables() {
  const { t: tr } = useTranslation(['nav', 'books']);
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          title: tr('nav:title.payables'),
          // What was still owed when the books started, brought in invoice by invoice (RULES 6.12).
          headerRight: () => (
            <Button title={tr('books:openings.action')} icon="upload" variant="ghost" size="sm" onPress={() => router.push('/(app)/books/openings/import?side=payable' as never)} />
          ),
        }}
      />
      <AgingScreen kind="payable" />
    </>
  );
}
