import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Avatar } from '@esmart/ui/components/Avatar';
import { FieldShell } from '@esmart/ui/components/Field';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { Text } from '@esmart/ui/components/Text';
import type { Address, Party } from '@esmart/core/types';

type Line = { text: string; icon?: IconName };

const addressLines = (a?: Address): Line[] =>
  a?.line1 ? [a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(' – '), a.state].filter((l): l is string => !!l).map((text) => ({ text })) : [];

/**
 * The customer or supplier a desktop form is for, across the form's whole width, as an invoice's
 * bill-to block: empty, a slim dashed bar to pick one into; picked, who they are (name, GSTIN and
 * the form's own badges) beside where they are billed and shipped to and how to reach them.
 * Labelled like the fields under it. The invoice and bill editors and the payment form share it.
 */
export function PartyPickerBox({
  label,
  party,
  pending,
  emptyTitle,
  badges,
  accessibilityLabel,
  onPress,
  required = true,
}: {
  label: string;
  party?: Party;
  /** The party is named but not in yet: a placeholder rather than "Select…". */
  pending?: boolean;
  emptyTitle: string;
  /** Under the name: terms, currency, open documents. */
  badges?: React.ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  required?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'contacts']);

  const billTo = addressLines(party?.billingAddress);
  const shipTo = addressLines(party?.shippingAddress);
  const sameAddress = shipTo.map((l) => l.text).join() === billTo.map((l) => l.text).join();
  const contact: Line[] = [];
  if (party?.phone) contact.push({ text: party.phone, icon: 'phone-outline' });
  if (party?.email) contact.push({ text: party.email, icon: 'email-outline' });
  const columns = [
    billTo.length ? { label: tr('contacts:form.billingAddress'), lines: billTo } : null,
    shipTo.length && !sameAddress ? { label: tr('contacts:form.shippingAddress'), lines: shipTo } : null,
    contact.length ? { label: tr('sales:editor.partyContact'), lines: contact } : null,
  ].filter((c): c is { label: string; lines: Line[] } => !!c);
  const filled = !!party || !!pending;

  return (
    <FieldShell label={label} required={required}>
      <Pressable
        style={(state) => {
          const { hovered, pressed, focused } = state as WebPressState;
          return [
            {
              flexDirection: 'row',
              alignItems: party ? 'stretch' : 'center',
              gap: t.spacing.lg,
              borderRadius: t.radius.md,
              borderWidth: filled ? 1 : 1.5,
              borderStyle: filled ? 'solid' : 'dashed',
              borderColor: hovered || pressed ? t.c.primary : t.c.inputBorder,
              backgroundColor: !filled && (hovered || pressed) ? t.c.chip : t.c.paper,
              paddingHorizontal: t.spacing.lg,
              paddingVertical: party ? t.spacing.lg : t.spacing.md,
            } as const,
            focusRing(t, focused),
          ];
        }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {party ? (
          <>
            <View style={{ flex: 1.3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <Avatar name={party.name} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="body" weight="600" numberOfLines={1}>
                  {party.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {party.taxId ?? party.phone ?? party.email ?? party.code}
                </Text>
                {badges ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>{badges}</View> : null}
              </View>
            </View>
            {columns.map((c) => (
              <View key={c.label} style={{ flex: 1, minWidth: 0, gap: 3, paddingLeft: t.spacing.lg, borderLeftWidth: 1, borderLeftColor: t.c.line }}>
                <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {c.label}
                </Text>
                {c.lines.map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {l.icon ? <Icon name={l.icon} size={14} color={t.c.muted} /> : null}
                    <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
                      {l.text}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={{ justifyContent: 'center' }}>
              <Icon name="chevron-right" size={20} color={t.c.muted} />
            </View>
          </>
        ) : pending ? (
          <>
            <Skeleton height={40} width={40} radius={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton height={14} width={180} radius={4} />
              <Skeleton height={10} width={120} radius={4} />
            </View>
          </>
        ) : (
          <>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="account-plus-outline" size={20} color={t.c.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="600" tone="primary">
                {emptyTitle}
              </Text>
              <Text variant="caption" tone="muted">
                {tr('sales:editor.partySearch')}
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={t.c.muted} />
          </>
        )}
      </Pressable>
    </FieldShell>
  );
}
