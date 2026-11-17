import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { DIALOG_WIDTH, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Text } from '@esmart/ui/components/Text';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { Button } from '@esmart/ui/components/Button';

/**
 * Right after an invoice is issued: what it still needs before the goods go or the customer is billed
 * in full, each a button to where it is done. Raise e-invoice (the IRN), raise e-way bill; only those
 * that apply are offered, and Later leaves both for the invoice's compliance card.
 */
export function ComplianceNextSteps({
  visible,
  number,
  eInvoice,
  ewayBill,
  onEInvoice,
  onEwayBill,
  onLater,
}: {
  visible: boolean;
  number: string;
  /** The invoice is to be reported to the IRP and hasn't been yet. */
  eInvoice: boolean;
  /** Its goods need an e-way bill and have none yet. */
  ewayBill: boolean;
  onEInvoice: () => void;
  onEwayBill: () => void;
  onLater: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'common']);
  const desktop = useIsDesktop();

  const step = (icon: IconName, title: string, body: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      style={(state) => {
        const { hovered, pressed, focused } = state as WebPressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            padding: t.spacing.md,
            borderRadius: t.radius.lg,
            borderWidth: 1,
            borderColor: hovered || pressed ? t.c.primary : t.c.line,
            backgroundColor: hovered || pressed ? t.c.chip : t.c.paper,
          },
          focusRing(t, focused),
        ];
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={t.c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={t.c.muted} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater} statusBarTranslucent>
      <Pressable onPress={onLater} style={{ flex: 1, backgroundColor: t.c.overlay, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal
          aria-label={tr('compliance:nextSteps.title', { number })}
          style={[
            {
              width: '100%',
              maxWidth: desktop ? DIALOG_WIDTH.md : 400,
              backgroundColor: t.c.paper,
              borderRadius: t.radius.xl,
              borderWidth: t.scheme === 'dark' ? 1 : 0,
              borderColor: t.c.line,
              padding: t.spacing.xl,
              gap: t.spacing.md,
            },
            t.shadow.sheet,
          ]}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.goodSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check-decagram-outline" size={22} color={t.c.good} />
          </View>
          <Text variant="title">{tr('compliance:nextSteps.title', { number })}</Text>
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
            {tr('compliance:nextSteps.body')}
          </Text>
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
            {/* The IRN first: an e-way bill can then be made from the e-invoice. */}
            {eInvoice ? step('shield-check-outline', tr('compliance:nextSteps.eInvoice'), tr('compliance:nextSteps.eInvoiceHint'), onEInvoice) : null}
            {ewayBill ? step('truck-outline', tr('compliance:nextSteps.ewayBill'), tr('compliance:nextSteps.ewayBillHint'), onEwayBill) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: desktop ? 'flex-end' : undefined, marginTop: t.spacing.sm }}>
            <Button title={tr('compliance:nextSteps.later')} variant="ghost" onPress={onLater} style={desktop ? undefined : { flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
