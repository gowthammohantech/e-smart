import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { Badge } from '@esmart/ui/components/Badge';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import type { PaymentAccount } from '@esmart/core/types';
import { useBankLineSummary } from '../../../../remote/queries';
import { usePaymentAccounts } from '../../../../store/selectors';

/** One bank account: how many of its statement lines are still to explain, and the bank's last balance. */
function AccountRow({ account, last }: { account: PaymentAccount; last: boolean }) {
  const router = useRouter();
  const { t: tr } = useTranslation(['banking']);
  const s = useBankLineSummary(account.id).data;
  const imported = !!s && s.unmatched + s.matched + s.excluded > 0;
  const subtitle = !s
    ? tr('banking:accounts.loading')
    : !imported
      ? tr('banking:accounts.none')
      : [
          tr('banking:accounts.counts', { unmatched: s.unmatched, matched: s.matched, excluded: s.excluded }),
          s.statementBalance ? tr('banking:accounts.balance', { amount: formatMoney(s.statementBalance), date: formatDate(s.statementBalanceDate ?? '') }) : tr('banking:accounts.noBalance'),
        ].join(' · ');
  return (
    <ListRow
      title={account.accountNumber ? `${account.name} · ${account.accountNumber.slice(-4)}` : account.name}
      subtitle={subtitle}
      icon="bank-outline"
      chevron
      divider={!last}
      right={
        s && imported ? (
          s.unmatched ? (
            <Badge label={tr('banking:accounts.toExplain', { count: s.unmatched })} tone="warning" size="sm" />
          ) : (
            <Badge label={tr('banking:accounts.allExplained')} tone="success" size="sm" icon="check" />
          )
        ) : undefined
      }
      onPress={() => router.push(`/(app)/books/reconciliation/${account.id}` as never)}
    />
  );
}

/** Bank reconciliation: the company's bank accounts, each with what its imported statements still need. */
export default function BankReconciliationHome() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['banking']);
  const banks = usePaymentAccounts().filter((a) => a.type === 'bank');
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('banking:title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('banking:accounts.intro')}
        </Text>
        {banks.length ? (
          <Card padded={false}>
            {banks.map((a, i) => (
              <AccountRow key={a.id} account={a} last={i === banks.length - 1} />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="bank-outline"
            title={tr('banking:accounts.emptyTitle')}
            message={tr('banking:accounts.emptyBody')}
            actionLabel={tr('banking:accounts.emptyAction')}
            onAction={() => router.push('/(app)/settings/accounts' as never)}
          />
        )}
      </ScrollView>
    </View>
  );
}
