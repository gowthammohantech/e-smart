import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useToast } from '@esmart/ui/components/Toast';
import type { OutstandingDoc } from '@esmart/core/domain/receivables';
import type { Party } from '@esmart/core/types';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { useBaseCurrency } from '../../store/selectors';

/**
 * A payment reminder for one customer's open invoices, sent from the
 * person's own WhatsApp or mail app. Open while `party` is set.
 */
export function PaymentReminderSheet({ party, rows, onClose }: { party: Party | undefined; rows: OutstandingDoc[]; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  const toast = useToast();
  const baseCurrency = useBaseCurrency();

  const text = party
    ? `Hi ${party.displayName ?? party.name}, a gentle reminder that ${rows.length === 1 ? 'invoice' : 'invoices'} ${rows
        .map((o) => o.document.number)
        .join(', ')} totalling ${formatMoney(
        money(
          rows.reduce((a, o) => a + Math.round(o.outstanding.minor * (o.document.exchangeRate || 1)), 0),
          baseCurrency,
        ),
      )} ${rows.length === 1 ? 'is' : 'are'} still open. Could you let us know when payment is planned? Thank you.`
    : '';

  return (
    <Sheet
      visible={!!party}
      onClose={onClose}
      title={tr('sales:aging.sendReminder')}
      subtitle={party?.name}
      footer={
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button
            title={tr('sales:aging.whatsapp')}
            icon="whatsapp"
            style={{ flex: 1 }}
            onPress={() => {
              const phone = (party?.phone ?? '').replace(/[^0-9]/g, '');
              Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`).catch(() => {});
              onClose();
              toast.show(tr('sales:aging.openedWhatsapp'), 'success');
            }}
          />
          <Button
            title={tr('sales:aging.email')}
            variant="secondary"
            icon="email-outline"
            style={{ flex: 1 }}
            onPress={() => {
              Linking.openURL(`mailto:${party?.email ?? ''}?subject=${encodeURIComponent('Payment reminder')}&body=${encodeURIComponent(text)}`).catch(() => {});
              onClose();
              toast.show(tr('sales:aging.openedEmail'), 'success');
            }}
          />
        </View>
      }
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Card variant="flat">
          <Text variant="small" style={{ lineHeight: 21 }}>
            {text}
          </Text>
        </Card>
        <Text variant="caption" tone="muted">{tr('sales:aging.reminderNote')}</Text>
      </View>
    </Sheet>
  );
}
