import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Screen } from '@esmart/ui/components/Screen';
import { Text } from '@esmart/ui/components/Text';
import { AccountsDashboard } from '../../features/dashboard/AccountsDashboard';

/**
 * Accounts & P&L: the period's profit as the profit report gives it, where the cash went, the GST
 * position, and, for someone who sees every branch, the balance sheet and the accounts that moved.
 */
export default function AccountsHub() {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports']);
  const desktop = useIsDesktop();

  return (
    <>
      <Stack.Screen options={{ title: tr('reports:dash.accounts.title') }} />
      <Screen bottomInset={40}>
        {/* On a desktop the page title sits right above: the subtitle follows it closely, as on the other hubs. */}
        <Text variant="small" tone="muted" style={{ marginTop: desktop ? 0 : t.spacing.md }}>
          {tr('reports:dash.accounts.subtitle')}
        </Text>
        <AccountsDashboard />
      </Screen>
    </>
  );
}
