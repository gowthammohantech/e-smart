import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { HubTiles } from '@esmart/ui/components/HubTiles';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { AppHeader } from '../../../components/AppHeader';
import { useSectionTiles } from '../../../navigation/useSectionTiles';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { useHasModule } from '../../../store/selectors';
import { AccountsDashboard } from '../../../features/dashboard/AccountsDashboard';

/**
 * Money: everything about cash rather than documents — payments both ways,
 * receipts, who owes and is owed, expenses and the books. Not on the phone's
 * tab bar; reached from More there and from the sidebar on the web. With the
 * books, it opens on the accounts dashboard (profit, cash, GST, balance sheet)
 * for the period picked, the section's pages under it.
 */
export default function MoneyTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'reports']);
  const tiles = useSectionTiles('money');
  // The dashboard reads the books: without them (Free, Basic) the overview is its pages alone.
  const books = useHasModule('books');

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('nav:overviewOf.money')} subtitle={tr('nav:money.subtitle')} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {books ? <AccountsDashboard /> : null}
        {books ? <SectionHeader title={tr('reports:dash.accounts.pages')} /> : null}
        <HubTiles tiles={tiles} />
      </ScrollView>
    </View>
  );
}
