import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { HubTiles } from '@esmart/ui/components/HubTiles';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { AppHeader } from '../../../components/AppHeader';
import { useSectionTiles } from '../../../navigation/useSectionTiles';

/**
 * Money: everything about cash rather than documents — payments both ways,
 * receipts, who owes and is owed, expenses and the books. Not on the phone's
 * tab bar; reached from More there and from the sidebar on the web.
 */
export default function MoneyTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const tiles = useSectionTiles('money');

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('nav:tab.money')} subtitle={tr('nav:money.subtitle')} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <HubTiles tiles={tiles} />
      </ScrollView>
    </View>
  );
}
