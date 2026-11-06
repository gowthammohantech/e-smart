import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Segmented } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
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
  // Changing how stock is kept changes every report from its day, so it is asked first.
  const [asking, setAsking] = useState<'on' | 'off' | null>(null);
  const costing = company.stockCosting ?? 'average';
  const [askCosting, setAskCosting] = useState<'average' | 'fifo' | null>(null);
  const setCosting = (stockCosting: 'average' | 'fifo') =>
    serverSave(() => saveCompany({ ...company, stockCosting }), tr(`books:close.costingSaved.${stockCosting}`), { icon: 'package-variant-closed' });

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
            <Button title={tr('books:close.turnOff')} icon="package-variant" variant="secondary" onPress={() => setAsking('off')} disabled={blocked || saving || !canGoBack} />
          ) : (
            <Button title={`${tr('books:close.turnOn')} · ${formatDate(perpetualStart)}`} icon="package-variant-closed" onPress={() => setAsking('on')} loading={saving} disabled={blocked} />
          )
        ) : null}

        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="body" weight="600">
            {tr('books:close.costingTitle')}
          </Text>
          <Text variant="caption" tone="muted">
            {tr(`books:close.costingBody.${costing}`)}
          </Text>
          {owner ? (
            <Segmented
              options={(['average', 'fifo'] as const).map((v) => ({ value: v, label: tr(`books:close.costing.${v}`) }))}
              value={costing}
              onChange={(v) => v !== costing && setAskCosting(v as 'average' | 'fifo')}
            />
          ) : null}
          {owner && company.lockedThroughDate ? (
            <Text variant="caption" tone="muted">
              {tr('books:close.costingLocked')}
            </Text>
          ) : null}
        </Card>
      </ScrollView>
      <ConfirmDialog
        visible={!!askCosting}
        icon="package-variant-closed"
        title={tr('books:close.costingAskTitle', { method: askCosting ? tr(`books:close.costing.${askCosting}`) : '' })}
        message={tr('books:close.costingAskBody')}
        confirmLabel={tr('books:close.costingConfirm')}
        onCancel={() => setAskCosting(null)}
        onConfirm={() => {
          const v = askCosting!;
          setAskCosting(null);
          void setCosting(v);
        }}
      />
      <ConfirmDialog
        visible={!!asking}
        icon="package-variant-closed"
        title={asking === 'on' ? tr('books:close.turnOnTitle', { date: formatDate(perpetualStart) }) : tr('books:close.turnOffTitle')}
        message={asking === 'on' ? tr('books:close.turnOnBody', { date: formatDate(perpetualStart) }) : tr('books:close.turnOffBody', { date: perpetual ? formatDate(perpetual) : '' })}
        confirmLabel={asking === 'on' ? tr('books:close.turnOn') : tr('books:close.turnOff')}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const on = asking === 'on';
          setAsking(null);
          void setPerpetual(on ? perpetualStart : null);
        }}
      />
    </View>
  );
}
