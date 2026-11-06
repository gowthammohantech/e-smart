import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Combobox } from '@esmart/ui/components/Combobox';
import { AmountField, TextField } from '@esmart/ui/components/Field';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import type { SelectOption } from '@esmart/ui/components/pickers/SelectSheet';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { useCostCentres } from '../../store/books';
import { CostCentreField } from './CostCentreField';

export type Side = 'dr' | 'cr';
export type GridLine = { id: string; side: Side; account: string; amount: string; narration?: string; costCentreId?: string };
export const gridLine = (side: Side = 'dr'): GridLine => ({ id: uid('vl'), side, account: '', amount: '' });

/** Column widths on a desktop, shared by the heading and every row so they line up. */
const COL = { side: 56, account: 3, amount: 1.4, narration: 2.4, centre: 1.6, remove: 28 } as const;

/**
 * A voucher's lines as one table, the way a ledger book is ruled: Dr or Cr, the account, the amount.
 * Rows are always on screen, and the form keeps a blank one at the end to type the next into. On a
 * desktop the account is typed into its cell; on a phone it opens a sheet (`onPickAccount`).
 */
export function VoucherGrid({
  lines,
  currency,
  debit,
  credit,
  accountLabel,
  accountOptions,
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
  /** The accounts a row may take, for the desktop's type-ahead cell. */
  accountOptions: SelectOption[];
  onPickAccount: (lineId: string) => void;
  onPatch: (lineId: string, patch: Partial<GridLine>) => void;
  onRemove: (lineId: string) => void;
  onAdd: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books']);
  const desktop = useIsDesktop();
  // A column of its own only once the business has cost centres (or a line already carries one).
  const centres = useCostCentres().length > 0 || lines.some((l) => l.costCentreId);
  const fmt = (minor: number) => formatMoney(money(minor, currency));

  // The same box as the inputs beside it: height, radius and border.
  const height = t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 40 : 48;
  const cell = { height, borderWidth: 1, borderColor: t.c.inputBorder, borderRadius: t.radius.md, paddingHorizontal: t.spacing.md, justifyContent: 'center' as const };
  const head = (label: string, style?: object) => (
    <Text variant="caption" tone="muted" weight="700" numberOfLines={1} style={[{ textTransform: 'uppercase', letterSpacing: 0.6 }, style]}>
      {label}
    </Text>
  );
  const amountHead = (label: string) => (
    // Lined up with the figures under it, which sit inside the field's padding.
    <View style={{ flex: COL.amount, paddingRight: t.spacing.md }}>{head(label, { textAlign: 'right' })}</View>
  );

  return (
    // Above what follows it, so the last row's account list can drop down over the form.
    <Card padded={false} style={{ zIndex: 1, overflow: 'visible' }}>
      {desktop ? (
        <View
          style={{
            flexDirection: 'row',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.md,
            paddingVertical: t.spacing.sm,
            backgroundColor: t.c.card2,
            alignItems: 'center',
            borderTopLeftRadius: t.radius.lg,
            borderTopRightRadius: t.radius.lg,
          }}
        >
          {head(tr('books:vouchers.drCr'), { width: COL.side, textAlign: 'center' })}
          {head(tr('books:vouchers.account'), { flex: COL.account })}
          {amountHead(tr('books:vouchers.debit'))}
          {amountHead(tr('books:vouchers.credit'))}
          {head(tr('books:vouchers.lineNarration'), { flex: COL.narration })}
          {centres ? head(tr('books:costCentres.field'), { flex: COL.centre }) : null}
          <View style={{ width: COL.remove }} />
        </View>
      ) : null}

      {lines.map((l, i) => {
        const name = l.account ? accountLabel(l.account) : undefined;
        const toggle = (
          <Pressable
            onPress={() => onPatch(l.id, { side: l.side === 'dr' ? 'cr' : 'dr' })}
            accessibilityRole="button"
            accessibilityLabel={l.side === 'dr' ? tr('books:vouchers.debit') : tr('books:vouchers.credit')}
            style={(state) => [cell, { width: COL.side, paddingHorizontal: 0, alignItems: 'center', backgroundColor: l.side === 'dr' ? t.c.chip : t.c.card2 }, focusRing(t, (state as WebPressState).focused)]}
          >
            <Text variant="small" weight="700">
              {l.side === 'dr' ? tr('books:accounts.dr') : tr('books:accounts.cr')}
            </Text>
          </Pressable>
        );
        const account = desktop ? (
          <Combobox
            value={l.account || null}
            options={accountOptions}
            onSelect={(account) => onPatch(l.id, { account })}
            placeholder={tr('books:vouchers.pickAccount')}
            label={tr('books:vouchers.account')}
            containerStyle={{ flex: COL.account, minWidth: 0 }}
          />
        ) : (
          <Pressable onPress={() => onPickAccount(l.id)} accessibilityRole="button" accessibilityLabel={tr('books:vouchers.pickAccount')} style={[cell, { flex: COL.account }]}>
            <Text variant="small" tone={name ? undefined : 'muted'} numberOfLines={1}>
              {name ?? tr('books:vouchers.pickAccount')}
            </Text>
          </Pressable>
        );
        const amount = <AmountField value={l.amount} onChangeValue={(amount) => onPatch(l.id, { amount })} currency={currency} align="right" containerStyle={{ flex: COL.amount, minWidth: 0 }} />;
        const remove =
          lines.length > 2 ? (
            <Pressable onPress={() => onRemove(l.id)} accessibilityRole="button" accessibilityLabel={tr('books:vouchers.removeLine')} hitSlop={8} style={{ width: COL.remove, height, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} color={t.c.muted} />
            </Pressable>
          ) : (
            <View style={{ width: COL.remove }} />
          );
        const divider = { borderTopWidth: i ? 1 : 0, borderTopColor: t.c.line };
        // Earlier rows over later ones, so an open account list isn't drawn under the next row.
        const stack = { zIndex: lines.length - i };

        if (desktop) {
          return (
            <View key={l.id} style={[{ flexDirection: 'row', gap: t.spacing.sm, padding: t.spacing.sm, paddingHorizontal: t.spacing.md, alignItems: 'flex-start' }, divider, stack]}>
              {toggle}
              {account}
              {/* The amount sits in its side's column; the other column stays blank, as in a ledger. */}
              {l.side === 'dr' ? amount : <View style={{ flex: COL.amount }} />}
              {l.side === 'cr' ? amount : <View style={{ flex: COL.amount }} />}
              <TextField
                value={l.narration ?? ''}
                onChangeText={(narration) => onPatch(l.id, { narration })}
                placeholder={tr('books:vouchers.lineNarrationPlaceholder')}
                accessibilityLabel={tr('books:vouchers.lineNarration')}
                containerStyle={{ flex: COL.narration, minWidth: 0 }}
              />
              {centres ? (
                <View style={{ flex: COL.centre, minWidth: 0 }}>
                  <CostCentreField compact value={l.costCentreId} onChange={(costCentreId) => onPatch(l.id, { costCentreId })} />
                </View>
              ) : null}
              {remove}
            </View>
          );
        }
        return (
          <View key={l.id} style={[{ padding: t.spacing.md, gap: t.spacing.sm }, divider]}>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
              {toggle}
              {account}
              {remove}
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
              <View style={{ width: COL.side }} />
              {amount}
              <View style={{ width: COL.remove }} />
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
