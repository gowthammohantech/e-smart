import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Segmented } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { BankLinesView } from '../../../../../features/banking/BankLinesView';
import { ReconciliationView } from '../../../../../features/banking/ReconciliationView';
import { useQueryParams } from '../../../../../navigation/queryParams';
import { useCanWrite } from '../../../../../remote/connectivity';
import { useBankLineSummary } from '../../../../../remote/queries';
import { usePaymentAccounts } from '../../../../../store/selectors';

const TABS = ['unmatched', 'matched', 'excluded', 'reconciliation'] as const;
type Tab = (typeof TABS)[number];

/**
 * One bank account's statements: the lines still to explain, those matched
 * to the books, those set aside, and the reconciliation statement; with the
 * way in to import another statement.
 */
export default function BankAccountReconciliation() {
  const t = useTheme();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['banking']);
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const account = usePaymentAccounts().find((a) => a.id === accountId);
  const summary = useBankLineSummary(account?.type === 'bank' ? account.id : undefined).data;
  const canWrite = useCanWrite();
  const [params, setParams] = useQueryParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.tab ?? '') ? (params.tab as Tab) : 'unmatched';

  if (!account || account.type !== 'bank') {
    return (
      <View style={{ flex: 1, padding: t.spacing.lg }}>
        <Stack.Screen options={{ title: tr('banking:title') }} />
        <EmptyState icon="bank-off-outline" title={tr('banking:account.notFound')} actionLabel={tr('banking:account.back')} onAction={() => router.replace('/(app)/books/reconciliation' as never)} />
      </View>
    );
  }

  const count = (s: 'unmatched' | 'matched' | 'excluded') => (summary ? ` (${summary[s]})` : '');
  const importButton = (
    <Button
      title={tr('banking:account.import')}
      icon="upload"
      size={desktop ? 'sm' : 'md'}
      onPress={() => router.push(`/(app)/books/reconciliation/${account.id}/import` as never)}
      disabled={!canWrite}
    />
  );
  const status = summary
    ? summary.lastStatement
      ? tr('banking:account.lastStatement', {
          from: formatDate(summary.lastStatement.from),
          to: formatDate(summary.lastStatement.to),
          balance: summary.statementBalance ? formatMoney(summary.statementBalance) : '—',
        })
      : tr('banking:account.noStatement')
    : '';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: account.name, ...(desktop ? { headerRight: () => importButton } : null) }} />
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: desktop ? 0 : t.spacing.md, paddingBottom: t.spacing.md, gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            {status}
          </Text>
          {desktop ? null : importButton}
        </View>
        <Segmented<Tab>
          options={TABS.map((k) => ({ value: k, label: tr(`banking:tab.${k}`) + (k === 'reconciliation' ? '' : count(k)) }))}
          value={tab}
          onChange={(v) => setParams({ tab: v === 'unmatched' ? undefined : v })}
          size={desktop ? 'md' : 'sm'}
        />
      </View>
      <View style={{ flex: 1, paddingHorizontal: desktop ? t.spacing.lg : 0, paddingBottom: desktop ? t.spacing.lg : 0 }}>
        {tab === 'reconciliation' ? <ReconciliationView accountId={account.id} accountName={account.name} /> : <BankLinesView key={tab} accountId={account.id} status={tab} />}
      </View>
    </View>
  );
}
