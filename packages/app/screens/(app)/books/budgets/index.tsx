import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { financialYearOf } from '@esmart/core/lib/date';
import { useCanWrite } from '../../../../remote/connectivity';
import { useBudgets } from '../../../../remote/budgets';
import { useActiveCompany } from '../../../../store/selectors';

/** The business's budgets, the latest year first. */
export default function Budgets() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  const company = useActiveCompany();
  const canWrite = useCanWrite();
  const list = useBudgets();
  const rows = list.data ?? [];
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:budgets.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('books:budgets.intro')}
        </Text>
        {list.isPending ? (
          <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
        ) : rows.length ? (
          <Card padded={false}>
            {rows.map((b, i) => (
              <ListRow
                key={b.id}
                title={b.name}
                subtitle={[financialYearOf(b.yearFrom, company.fiscalYearStartMonth).label, tr('books:budgets.lines', { count: b.lines.length })].join(' · ')}
                icon="target"
                chevron
                onPress={() => router.push(`/(app)/books/budgets/${b.id}` as never)}
                divider={i < rows.length - 1}
              />
            ))}
          </Card>
        ) : (
          <EmptyState icon="target" title={tr('books:budgets.empty')} message={tr('books:budgets.emptyBody')} />
        )}
      </ScrollView>
      {canWrite ? <PrimaryActionBar title={tr('books:budgets.add')} icon="plus" onPress={() => router.push('/(app)/books/budgets/new' as never)} /> : null}
    </View>
  );
}
