import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { TDS_SECTIONS } from '@esmart/core/data/tdsSections';
import { accountFor, chartOfAccounts, type Account } from '@esmart/core/domain/ledger/accounts';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { Voucher, VoucherKind } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useAppStore } from '../../store/appStore';
import { useServerBook } from '../../remote/queries';
import { useActiveCompany, useBaseCurrency, useDefaultBranchId } from '../../store/selectors';
import { useAccountName, useGroupName } from './names';
import { VoucherGrid, gridLine, type GridLine } from './VoucherGrid';

const KINDS: VoucherKind[] = ['journal', 'contra', 'gstJournal', 'tdsChallan'];

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
  // The chart the server names accounts from, rather than every posting worked out on the device.
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const groupName = useGroupName();

  const [kind, setKind] = useState<VoucherKind>(voucher?.kind ?? 'journal');
  const [date, setDate] = useState(voucher?.date ?? today());
  const [narration, setNarration] = useState(voucher?.narration ?? '');
  const [reference, setReference] = useState(voucher?.reference ?? '');
  // A TDS challan's deposit details, as printed on it (ITNS 281).
  const [bsrCode, setBsrCode] = useState(voucher?.challan?.bsrCode ?? '');
  const [serial, setSerial] = useState(voucher?.challan?.serial ?? '');
  const [depositedOn, setDepositedOn] = useState(voucher?.challan?.depositedOn ?? voucher?.date ?? today());
  const [lines, setLines] = useState<GridLine[]>(
    voucher?.lines.map((l) => ({
      id: uid('vl'),
      side: l.credit.minor ? 'cr' : 'dr',
      account: l.account,
      amount: String(toMajor(l.credit.minor ? l.credit : l.debit)),
      narration: l.narration,
      costCentreId: l.costCentreId,
    })) ?? [gridLine('dr'), gridLine('cr')],
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
  const total = (ls: GridLine[], side: GridLine['side']) => ls.reduce((a, l) => a + (l.side === side ? minor(l.amount) : 0), 0);
  const debit = total(lines, 'dr');
  const credit = total(lines, 'cr');
  const filled = lines.filter((l) => l.account && minor(l.amount));
  const challanGiven = kind === 'tdsChallan' && (bsrCode || serial);
  const challanBad = challanGiven && (!/^\d{7}$/.test(bsrCode) || !/^\d{1,5}$/.test(serial));
  const problem = filled.length < 2 ? tr('books:vouchers.needsTwo') : debit !== credit ? tr('books:vouchers.unbalanced') : challanBad ? tr('books:vouchers.challanInvalid') : null;

  /**
   * As in a ledger book: picking an account on an empty row fills in what's left to balance, and
   * while the voucher doesn't balance a fresh row waits on the short side.
   */
  const patchLine = (id: string, p: Partial<GridLine>) =>
    setLines((ls) => {
      let next = ls.map((l) => (l.id === id ? { ...l, ...p } : l));
      const changed = next.find((l) => l.id === id)!;
      const others = next.filter((l) => l.id !== id);
      const gap = total(others, 'dr') - total(others, 'cr');
      if (p.account && !changed.amount && gap) {
        next = next.map((l) => (l.id === id ? { ...l, side: gap > 0 ? 'cr' : 'dr', amount: String(toMajor(money(Math.abs(gap), baseCurrency))) } : l));
      }
      const last = next[next.length - 1];
      const off = total(next, 'dr') - total(next, 'cr');
      if (last.account && minor(last.amount) && off) next = [...next, gridLine(off > 0 ? 'cr' : 'dr')];
      return next;
    });

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
      challan: challanGiven ? { bsrCode, serial, depositedOn } : undefined,
      lines: filled.map((l) => ({
        account: l.account,
        debit: money(l.side === 'dr' ? minor(l.amount) : 0, baseCurrency),
        credit: money(l.side === 'cr' ? minor(l.amount) : 0, baseCurrency),
        ...(l.narration?.trim() && { narration: l.narration.trim() }),
        ...(l.costCentreId && { costCentreId: l.costCentreId }),
      })),
      createdBy: voucher?.createdBy ?? '',
      createdAt: voucher?.createdAt ?? nowISO(),
    };
    const res = await serverSave(() => saveVoucher(record), tr('books:vouchers.saved'), { icon: 'swap-horizontal', detail: tr(`books:vouchers.kind.${kind}`) });
    if (res) onSaved(res.id ?? record.id);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer wide>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {voucher ? null : (
            <Segmented options={KINDS.map((k) => ({ value: k, label: tr(`books:vouchers.kind.${k}`) }))} value={kind} onChange={(v) => setKind(v as VoucherKind)} />
          )}
          <Text variant="small" tone="muted">
            {tr(`books:vouchers.kindHint.${kind}`)}
          </Text>
          <DateField label={tr('books:vouchers.date')} value={date} onChange={setDate} maximumDate={new Date()} />

          <VoucherGrid
            lines={lines}
            currency={baseCurrency}
            debit={debit}
            credit={credit}
            accountLabel={(key) => {
              const a = accounts.find((x) => x.key === key) ?? accountFor(key, book);
              return a ? nameOf(a) : undefined;
            }}
            onPickAccount={setPicking}
            onPatch={patchLine}
            onRemove={(id) => setLines((ls) => ls.filter((x) => x.id !== id))}
            onAdd={() => setLines((ls) => [...ls, gridLine(debit > credit ? 'cr' : 'dr')])}
          />
          {problem ? (
            <Text variant="caption" tone="bad">
              {problem}
            </Text>
          ) : null}

          <TextField label={tr('books:vouchers.narration')} value={narration} onChangeText={setNarration} placeholder={tr('books:vouchers.narrationPlaceholder')} multiline />
          {kind === 'tdsChallan' ? (
            <>
              <TextField label={tr('books:vouchers.bsrCode')} value={bsrCode} onChangeText={(v) => setBsrCode(v.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" hint={tr('books:vouchers.bsrHint')} />
              <TextField label={tr('books:vouchers.challanSerial')} value={serial} onChangeText={(v) => setSerial(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" />
              <DateField label={tr('books:vouchers.depositedOn')} value={depositedOn} onChange={setDepositedOn} maximumDate={new Date()} />
            </>
          ) : null}
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
