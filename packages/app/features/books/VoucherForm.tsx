import React, { useMemo, useState } from 'react';
import { CostCentreField } from './CostCentreField';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { AmountField, PickerField, Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { TDS_SECTIONS } from '@esmart/core/data/tdsSections';
import { accountFor, chartOfAccounts, type Account } from '@esmart/core/domain/ledger/accounts';
import { formatMoney } from '@esmart/core/lib/format';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { Voucher, VoucherKind } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useAppStore } from '../../store/appStore';
import { useBooks } from '../../store/books';
import { useActiveCompany, useBaseCurrency, useDefaultBranchId } from '../../store/selectors';
import { useAccountName, useGroupName } from './names';

const KINDS: VoucherKind[] = ['journal', 'contra', 'gstJournal', 'tdsChallan'];
type Line = { id: string; account: string; debit: string; credit: string; costCentreId?: string };
const blank = (): Line => ({ id: uid('vl'), account: '', debit: '', credit: '' });

/**
 * A journal, contra, GST journal or TDS challan: lines of debits and credits that must balance.
 * The server checks the same rules (apps/api/src/modules/books/handlers.ts).
 */
export function VoucherForm({ voucher, onSaved }: { voucher?: Voucher; onSaved: (id: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const { book } = useBooks();
  const nameOf = useAccountName();
  const groupName = useGroupName();

  const [kind, setKind] = useState<VoucherKind>(voucher?.kind ?? 'journal');
  const [date, setDate] = useState(voucher?.date ?? today());
  const [narration, setNarration] = useState(voucher?.narration ?? '');
  const [reference, setReference] = useState(voucher?.reference ?? '');
  const [lines, setLines] = useState<Line[]>(
    voucher?.lines.map((l) => ({ id: uid('vl'), account: l.account, debit: l.debit.minor ? String(toMajor(l.debit)) : '', credit: l.credit.minor ? String(toMajor(l.credit)) : '', costCentreId: l.costCentreId })) ?? [blank(), blank()],
  );
  const [picking, setPicking] = useState<string | null>(null);

  // What each kind may post to: a contra only cash and bank, a TDS challan TDS payable against cash or bank.
  const accounts = useMemo(() => {
    const tdsPayable: Account[] = TDS_SECTIONS.map((s) => accountFor(`sys:tdsPayable:${s.code}`, book)!);
    const all = [...chartOfAccounts(book).filter((a) => a.key !== 'sys:openingStock'), ...tdsPayable];
    const cash = (a: Account) => a.group === 'cashInHand' || a.group === 'bankAccounts';
    if (kind === 'contra') return all.filter(cash);
    if (kind === 'tdsChallan') return all.filter((a) => cash(a) || a.key.startsWith('sys:tdsPayable'));
    return all;
  }, [book, kind]);

  const minor = (v: string) => fromMajor(v || '0', baseCurrency).minor;
  const debit = lines.reduce((a, l) => a + minor(l.debit), 0);
  const credit = lines.reduce((a, l) => a + minor(l.credit), 0);
  const filled = lines.filter((l) => l.account && (minor(l.debit) || minor(l.credit)));
  const problem = filled.length < 2 ? tr('books:vouchers.needsTwo') : debit !== credit ? tr('books:vouchers.unbalanced') : null;

  const patchLine = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const save = async () => {
    if (problem) return;
    const record: Voucher = {
      id: voucher?.id ?? uid('vch'),
      companyId: voucher?.companyId ?? company.id,
      branchId: voucher?.branchId ?? defaultBranchId ?? '',
      kind,
      number: voucher?.number ?? '',
      date,
      narration: narration.trim() || undefined,
      reference: reference.trim() || undefined,
      lines: filled.map((l) => ({ account: l.account, debit: money(minor(l.debit), baseCurrency), credit: money(minor(l.credit), baseCurrency), ...(l.costCentreId && { costCentreId: l.costCentreId }) })),
      createdBy: voucher?.createdBy ?? '',
      createdAt: voucher?.createdAt ?? nowISO(),
    };
    const res = await serverSave(() => saveVoucher(record), tr('books:vouchers.saved'), { icon: 'swap-horizontal', detail: tr(`books:vouchers.kind.${kind}`) });
    if (res) onSaved(res.id ?? record.id);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {voucher ? null : (
            <Segmented options={KINDS.map((k) => ({ value: k, label: tr(`books:vouchers.kind.${k}`) }))} value={kind} onChange={(v) => setKind(v as VoucherKind)} />
          )}
          <Text variant="small" tone="muted">
            {tr(`books:vouchers.kindHint.${kind}`)}
          </Text>
          <DateField label={tr('books:vouchers.date')} value={date} onChange={setDate} maximumDate={new Date()} />

          {lines.map((l, i) => {
            const account = l.account ? accounts.find((a) => a.key === l.account) ?? accountFor(l.account, book) : undefined;
            return (
              <Card key={l.id} style={{ gap: t.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <PickerField label={tr('books:vouchers.account')} value={account ? nameOf(account) : undefined} placeholder={tr('books:vouchers.pickAccount')} onPress={() => setPicking(l.id)} icon="book-outline" />
                  </View>
                  {lines.length > 2 ? (
                    <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} accessibilityRole="button" accessibilityLabel={tr('books:vouchers.removeLine')} hitSlop={8} style={{ paddingTop: 22 }}>
                      <Icon name="close" size={20} color={t.c.muted} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                  <AmountField label={tr('books:vouchers.debit')} value={l.debit} onChangeValue={(v) => patchLine(l.id, { debit: v, credit: v ? '' : l.credit })} currency={baseCurrency} containerStyle={{ flex: 1 }} />
                  <AmountField label={tr('books:vouchers.credit')} value={l.credit} onChangeValue={(v) => patchLine(l.id, { credit: v, debit: v ? '' : l.debit })} currency={baseCurrency} containerStyle={{ flex: 1 }} />
                </View>
                <CostCentreField compact value={l.costCentreId} onChange={(costCentreId) => patchLine(l.id, { costCentreId })} />
                {i === lines.length - 1 && debit !== credit ? (
                  <Button
                    title={debit > credit ? `${tr('books:vouchers.credit')} ${formatMoney(money(debit - credit, baseCurrency))}` : `${tr('books:vouchers.debit')} ${formatMoney(money(credit - debit, baseCurrency))}`}
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      patchLine(l.id, debit > credit ? { credit: String(toMajor(money(minor(l.credit) + debit - credit, baseCurrency))), debit: '' } : { debit: String(toMajor(money(minor(l.debit) + credit - debit, baseCurrency))), credit: '' })
                    }
                  />
                ) : null}
              </Card>
            );
          })}
          <Button title={tr('books:vouchers.addLine')} icon="plus" variant="secondary" onPress={() => setLines((ls) => [...ls, blank()])} />

          <Card variant="flat" style={{ gap: t.spacing.sm }}>
            {[
              [tr('books:vouchers.totalDebit'), formatMoney(money(debit, baseCurrency))],
              [tr('books:vouchers.totalCredit'), formatMoney(money(credit, baseCurrency))],
              [tr('books:vouchers.difference'), formatMoney(money(Math.abs(debit - credit), baseCurrency))],
            ].map(([label, value]) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
                <Text variant="caption" weight="600">
                  {value}
                </Text>
              </View>
            ))}
            {problem ? (
              <Text variant="caption" tone="bad">
                {problem}
              </Text>
            ) : null}
          </Card>

          <TextField label={tr('books:vouchers.narration')} value={narration} onChangeText={setNarration} placeholder={tr('books:vouchers.narrationPlaceholder')} multiline />
          <TextField label={tr('books:vouchers.reference')} value={reference} onChangeText={setReference} hint={tr('books:vouchers.referenceHint')} icon="pound" />
        </ScrollView>
        <FormActions>
          <Button title={tr('books:vouchers.save')} onPress={() => void save()} loading={saving} disabled={blocked || !!problem} fullWidth size="lg" shortcut="S" />
        </FormActions>
      </FormContainer>

      <SelectSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={tr('books:vouchers.pickAccount')}
        options={accounts.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) }))}
        value={lines.find((l) => l.id === picking)?.account}
        onSelect={(account) => picking && patchLine(picking, { account })}
      />
    </KeyboardAvoidingView>
  );
}
