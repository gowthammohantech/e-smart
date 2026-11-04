import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { AmountField, TextField } from '@esmart/ui/components/Field';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { CostCentreField } from './CostCentreField';

export type Side = 'dr' | 'cr';
export type GridLine = { id: string; side: Side; account: string; amount: string; narration?: string; costCentreId?: string };
export const gridLine = (side: Side = 'dr'): GridLine => ({ id: uid('vl'), side, account: '', amount: '' });

/**
 * A voucher's lines as one table, the way a ledger book is ruled: Dr or Cr, the account, the amount.
 * Rows are always on screen; the form adds the next one while the voucher doesn't balance.
 */
export function VoucherGrid({
  lines,
  currency,
  debit,
  credit,
  accountLabel,
  onPickAccount,
  onPatch,
  onRemove,
  onAdd,
}: {
  lines: GridLine[];
  currency: string;
  debit: number;
  credit: number;
  /** The name shown for an account key, or undefined when none is picked. */
  accountLabel: (key: string) => string | undefined;
  onPickAccount: (lineId: string) => void;
  onPatch: (lineId: string, patch: Partial<GridLine>) => void;
  onRemove: (lineId: string) => void;
  onAdd: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books']);
  const desktop = useIsDesktop();
  const fmt = (minor: number) => formatMoney(money(minor, currency));

  const cell = { borderWidth: 1, borderColor: t.c.lineStrong, borderRadius: t.radius.sm, paddingHorizontal: t.spacing.md, minHeight: 44, justifyContent: 'center' as const };
  const head = (label: string, style?: object) => (
    <Text variant="caption" tone="muted" weight="700" style={[{ textTransform: 'uppercase', letterSpacing: 0.6 }, style]}>
      {label}
    </Text>
  );

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {desktop ? (
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.sm, backgroundColor: t.c.card2, alignItems: 'center' }}>
          {head(tr('books:vouchers.drCr'), { width: 56 })}
          {head(tr('books:vouchers.account'), { flex: 3 })}
          {head(tr('books:vouchers.debit'), { flex: 1.4, textAlign: 'right' })}
          {head(tr('books:vouchers.credit'), { flex: 1.4, textAlign: 'right' })}
          {head(tr('books:vouchers.lineNarration'), { flex: 2.4 })}
          <View style={{ width: 28 }} />
        </View>
      ) : null}

      {lines.map((l, i) => {
        const name = l.account ? accountLabel(l.account) : undefined;
        const toggle = (
          <Pressable
            onPress={() => onPatch(l.id, { side: l.side === 'dr' ? 'cr' : 'dr' })}
            accessibilityRole="button"
            accessibilityLabel={l.side === 'dr' ? tr('books:vouchers.debit') : tr('books:vouchers.credit')}
            style={[cell, { width: 56, alignItems: 'center', backgroundColor: l.side === 'dr' ? t.c.chip : t.c.card2 }]}
          >
            <Text variant="small" weight="700">
              {l.side === 'dr' ? tr('books:accounts.dr') : tr('books:accounts.cr')}
            </Text>
          </Pressable>
        );
        const account = (
          <Pressable onPress={() => onPickAccount(l.id)} accessibilityRole="button" accessibilityLabel={tr('books:vouchers.pickAccount')} style={[cell, { flex: 3 }]}>
            <Text variant="small" tone={name ? undefined : 'muted'} numberOfLines={1}>
              {name ?? tr('books:vouchers.pickAccount')}
            </Text>
          </Pressable>
        );
        const amount = <AmountField value={l.amount} onChangeValue={(amount) => onPatch(l.id, { amount })} currency={currency} containerStyle={{ flex: 1.4 }} />;
        const remove =
          lines.length > 2 ? (
            <Pressable onPress={() => onRemove(l.id)} accessibilityRole="button" accessibilityLabel={tr('books:vouchers.removeLine')} hitSlop={8} style={{ width: 28, alignItems: 'center' }}>
              <Icon name="close" size={18} color={t.c.muted} />
            </Pressable>
          ) : (
            <View style={{ width: 28 }} />
          );
        const divider = { borderTopWidth: i ? 1 : 0, borderTopColor: t.c.line };

        if (desktop) {
          return (
            <View key={l.id} style={[{ flexDirection: 'row', gap: t.spacing.sm, padding: t.spacing.sm, paddingHorizontal: t.spacing.md, alignItems: 'center' }, divider]}>
              {toggle}
              {account}
              {/* The amount sits in its side's column; the other column stays blank, as in a ledger. */}
              {l.side === 'dr' ? amount : <View style={{ flex: 1.4 }} />}
              {l.side === 'cr' ? amount : <View style={{ flex: 1.4 }} />}
              <View style={{ flex: 2.4, gap: t.spacing.xs }}>
                <TextField value={l.narration ?? ''} onChangeText={(narration) => onPatch(l.id, { narration })} placeholder={tr('books:vouchers.lineNarrationPlaceholder')} />
                <CostCentreField compact value={l.costCentreId} onChange={(costCentreId) => onPatch(l.id, { costCentreId })} />
              </View>
              {remove}
            </View>
          );
        }
        return (
          <View key={l.id} style={[{ padding: t.spacing.md, gap: t.spacing.sm }, divider]}>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
              {toggle}
              {account}
              {remove}
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
              <View style={{ width: 56 }} />
              {amount}
              <View style={{ width: 28 }} />
            </View>
            <CostCentreField compact value={l.costCentreId} onChange={(costCentreId) => onPatch(l.id, { costCentreId })} />
          </View>
        );
      })}

      <View style={{ borderTopWidth: 1, borderTopColor: t.c.line, padding: t.spacing.md, gap: t.spacing.sm }}>
        <Button title={tr('books:vouchers.addLine')} icon="plus" variant="secondary" size="sm" onPress={onAdd} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: t.spacing.md }}>
          <Text variant="caption" weight="600">
            {tr('books:vouchers.totalDebit')} {fmt(debit)}
          </Text>
          <Text variant="caption" weight="600">
            {tr('books:vouchers.totalCredit')} {fmt(credit)}
          </Text>
          <Text variant="caption" weight="600" tone={debit === credit ? 'good' : 'bad'}>
            {tr('books:vouchers.difference')} {fmt(Math.abs(debit - credit))}
          </Text>
        </View>
      </View>
    </Card>
  );
}
