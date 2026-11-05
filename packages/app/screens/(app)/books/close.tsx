import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { addDaysISO, financialYearOf, formatDate, today } from '@esmart/core/lib/date';
import { useServerSave } from '../../../components/useServerSave';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useCurrentUser } from '../../../store/selectors';

/**
 * Closing the books through a date: nothing dated on or before it can be added, changed or removed
 * (documents, payments, expenses, vouchers). Filing GSTR-3B closes its month on its own. Only an
 * owner closes or reopens; the server checks the same.
 */
export default function CloseBooks() {
  const t = useTheme();
  const { t: tr } = useTranslation(['books']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const user = useCurrentUser();
  const saveCompany = useAppStore((s) => s.saveCompany);
  const owner = user?.role === 'owner';
  const lastFyEnd = (() => {
    const fy = financialYearOf(today(), company.fiscalYearStartMonth);
    return new Date(Date.parse(`${fy.start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  })();
  const [date, setDate] = useState(company.lockedThroughDate ?? lastFyEnd);

  // Perpetual stock starts a financial year still open: this one, or the next if this one is closed.
  const thisFy = financialYearOf(today(), company.fiscalYearStartMonth).start;
  const nextFy = financialYearOf(addDaysISO(financialYearOf(today(), company.fiscalYearStartMonth).end, 1), company.fiscalYearStartMonth).start;
  const perpetualStart = company.lockedThroughDate && company.lockedThroughDate >= thisFy ? nextFy : thisFy;
  const perpetual = company.perpetualStockFrom ?? null;
  const canGoBack = !!perpetual && !(company.lockedThroughDate && perpetual <= company.lockedThroughDate);
  const setPerpetual = (perpetualStockFrom: string | null) =>
    serverSave(() => saveCompany({ ...company, perpetualStockFrom }), perpetualStockFrom ? tr('books:close.perpetualOn', { date: formatDate(perpetualStockFrom) }) : tr('books:close.perpetualOff'), { icon: 'package-variant-closed' });

  const save = (lockedThroughDate: string | null) =>
    serverSave(() => saveCompany({ ...company, lockedThroughDate }), lockedThroughDate ? tr('books:close.closed', { date: formatDate(lockedThroughDate) }) : tr('books:close.reopened'), { icon: 'lock-outline' });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:hub.close') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="body" weight="600">
            {company.lockedThroughDate ? tr('books:close.closedThrough', { date: formatDate(company.lockedThroughDate) }) : tr('books:close.open')}
          </Text>
          <Text variant="caption" tone="muted">
            {tr('books:close.body')}
          </Text>
        </Card>
        {owner ? (
          <>
            <DateField label={tr('books:close.through')} value={date} onChange={setDate} maximumDate={new Date()} hint={tr('books:close.throughHint')} />
            <Button title={tr('books:close.close')} icon="lock-outline" onPress={() => void save(date)} loading={saving} disabled={blocked || date === company.lockedThroughDate} />
            {company.lockedThroughDate ? (
              <View style={{ gap: t.spacing.sm }}>
                <Text variant="caption" tone="muted">
                  {tr('books:close.reopenHint')}
                </Text>
                <Button title={tr('books:close.reopen')} icon="lock-open-variant-outline" variant="secondary" onPress={() => void save(null)} disabled={blocked || saving} />
              </View>
            ) : null}
          </>
        ) : (
          <Text variant="small" tone="muted">
            {tr('books:close.ownerOnly')}
          </Text>
        )}

        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="body" weight="600">
            {tr('books:close.stockTitle')}
          </Text>
          <Text variant="caption" tone="muted">
            {perpetual ? tr('books:close.perpetualSince', { date: formatDate(perpetual) }) : tr('books:close.periodic')}
          </Text>
          <Text variant="caption" tone="muted">
            {tr('books:close.perpetualBody')}
          </Text>
        </Card>
        {owner ? (
          perpetual ? (
            <Button title={tr('books:close.turnOff')} icon="package-variant" variant="secondary" onPress={() => void setPerpetual(null)} disabled={blocked || saving || !canGoBack} />
          ) : (
            <Button title={`${tr('books:close.turnOn')} · ${formatDate(perpetualStart)}`} icon="package-variant-closed" onPress={() => void setPerpetual(perpetualStart)} loading={saving} disabled={blocked} />
          )
        ) : null}
      </ScrollView>
    </View>
  );
}
