import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { StatementImport } from '../../../../../features/banking/StatementImportFlow';
import { useGoBack } from '../../../../../navigation/useGoBack';
import { usePaymentAccounts } from '../../../../../store/selectors';

/** Import a statement into one bank account, then back to its lines. */
export default function ImportBankStatement() {
  const t = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const { t: tr } = useTranslation(['banking']);
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const account = usePaymentAccounts().find((a) => a.id === accountId);
  if (!account || account.type !== 'bank') {
    return (
      <View style={{ flex: 1, padding: t.spacing.lg }}>
        <Stack.Screen options={{ title: tr('banking:import.screenTitle') }} />
        <EmptyState icon="bank-off-outline" title={tr('banking:account.notFound')} actionLabel={tr('banking:account.back')} onAction={() => router.replace('/(app)/books/reconciliation' as never)} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('banking:import.screenTitle') }} />
      <StatementImport account={account} onDone={() => goBack(`/(app)/books/reconciliation/${account.id}`)} />
    </View>
  );
}
