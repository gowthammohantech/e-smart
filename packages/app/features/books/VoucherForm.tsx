import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { TDS_SECTIONS } from '@esmart/core/data/tdsSections';
import { TCS_SECTIONS } from '@esmart/core/data/tcsSections';
import { accountFor, chartOfAccounts, type Account } from '@esmart/core/domain/ledger/accounts';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { Voucher, VoucherKind, VoucherTemplate } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useAppStore } from '../../store/appStore';
import { useServerBook } from '../../remote/queries';
import { LoadingView } from '../../components/LoadingView';
import { useActiveCompany, useBaseCurrency, useCurrentUser, useDefaultBranchId } from '../../store/selectors';
import { useAccountName, useGroupName } from './names';
import { VoucherGrid, gridLine, type GridLine } from './VoucherGrid';

/** Kept in step with VOUCHER_BLOCKED_KEYS in the API's books handlers. */
const BOOKS_ONLY = ['sys:openingStock', 'sys:accumulatedDepreciation', 'sys:goodsReceivedNotBilled'];

/** Earlier years' profit: posted only by an owner or admin, with a narration (RULES 6.25; the server checks it too). */
const RESERVES = 'sys:retainedEarnings';
const RESERVES_ROLES = ['owner', 'admin'];

const KINDS: VoucherKind[] = ['journal', 'contra', 'gstJournal', 'tdsChallan'];

/** A `?kind=` a menu opens the form on, when it is one this form makes. */
export const voucherKindParam = (v: string | string[] | undefined): VoucherKind | undefined => (KINDS as string[]).includes(String(v)) ? (v as VoucherKind) : undefined;

/** The empty rows a new voucher starts with: a contra moves money between two accounts, a journal often spreads over more. */
const blankLines = (kind: VoucherKind): GridLine[] =>
  kind === 'contra' || kind === 'tdsChallan' ? [gridLine('dr'), gridLine('cr')] : [gridLine('dr'), gridLine('cr'), gridLine('dr'), gridLine('cr')];
const isBlank = (l: GridLine) => !l.account && !l.amount && !l.narration && !l.costCentreId;

/**
 * A journal, contra, GST journal or TDS challan: lines of debits and credits that must balance.
 * The server checks the same rules (apps/api/src/modules/books/handlers.ts).
 */
export function VoucherForm({ voucher, onSaved, initialKind }: { voucher?: Voucher; onSaved: (id: string) => void; initialKind?: VoucherKind }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const saveTemplate = useAppStore((s) => s.saveVoucherTemplate);
  const templates = useAppStore((s) => s.voucherTemplates ?? []).filter((x) => x.companyId === company.id);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);
  // The chart the server names accounts from, rather than every posting worked out on the device.
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const groupName = useGroupName();

  const role = useCurrentUser()?.role;
  // Shown to an owner or admin; a voucher that already posts to it keeps showing it.
  const reservesOpen = RESERVES_ROLES.includes(role ?? '') || !!voucher?.lines.some((l) => l.account === RESERVES);

  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<VoucherKind>(voucher?.kind ?? initialKind ?? voucherKindParam(params.kind) ?? 'journal');
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
    })) ?? blankLines(kind),
  );
  const [picking, setPicking] = useState<string | null>(null);

  // What each kind may post to: a contra only cash and bank, a TDS challan TDS or TCS payable against cash or bank.
  const accounts = useMemo(() => {
    const tdsPayable: Account[] = TDS_SECTIONS.map((s) => accountFor(`sys:tdsPayable:${s.code}`, book)!);
    const tcsPayable: Account[] = TCS_SECTIONS.map((s) => accountFor(`sys:tcsPayable:${s.code}`, book)!);
    // Accounts only the books post to (stock, the asset register, goods receipts); the server refuses them too.
    const all = [...chartOfAccounts(book).filter((a) => !BOOKS_ONLY.includes(a.key) && (reservesOpen || a.key !== RESERVES)), ...tdsPayable, ...tcsPayable];
    const cash = (a: Account) => a.group === 'cashInHand' || a.group === 'bankAccounts';
    if (kind === 'contra') return all.filter(cash);
    // The same challan deposits TCS collected, so TCS payable may be cleared too.
    if (kind === 'tdsChallan') return all.filter((a) => cash(a) || a.key.startsWith('sys:tdsPayable') || a.key.startsWith('sys:tcsPayable'));
    return all;
  }, [book, kind, reservesOpen]);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) })), [accounts, nameOf, groupName]);

  const minor = (v: string) => fromMajor(v || '0', baseCurrency).minor;
  const total = (ls: GridLine[], side: GridLine['side']) => ls.reduce((a, l) => a + (l.side === side ? minor(l.amount) : 0), 0);
  const debit = total(lines, 'dr');
  const credit = total(lines, 'cr');
  const filled = lines.filter((l) => l.account && minor(l.amount));
  const challanGiven = kind === 'tdsChallan' && (bsrCode || serial);
  const challanBad = challanGiven && (!/^\d{7}$/.test(bsrCode) || !/^\d{1,5}$/.test(serial));
  const isDraft = voucher?.status === 'draft';
  // Kept to finish later: a draft only needs a line, and is checked in full when it is posted.
  const draftProblem = filled.length ? null : tr('books:vouchers.needsOne');
  const reservesBare = filled.some((l) => l.account === RESERVES) && !narration.trim();
  const problem =
    filled.length < 2
      ? tr('books:vouchers.needsTwo')
      : debit !== credit
        ? tr('books:vouchers.unbalanced')
        : challanBad
          ? tr('books:vouchers.challanInvalid')
          : reservesBare
            ? tr('books:vouchers.reservesNeedNarration')
            : null;

  /**
   * As in a ledger book: picking an account on an empty row fills in what's left to balance, and
   * once the last row is begun a fresh one waits under it, on the short side.
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
      if (last.account || minor(last.amount)) next = [...next, gridLine(off > 0 ? 'cr' : off < 0 ? 'dr' : last.side === 'dr' ? 'cr' : 'dr')];
      return next;
    });

  const save = async (status: 'draft' | 'posted') => {
    if (status === 'draft' ? draftProblem : problem) return;
    const record: Voucher = {
      id: voucher?.id ?? uid('vch'),
      companyId: voucher?.companyId ?? company.id,
      branchId: voucher?.branchId ?? defaultBranchId ?? '',
      kind,
      number: voucher?.number ?? '',
      status,
      date,
      narration: narration.trim() || undefined,
      reference: reference.trim() || undefined,
      challan: challanGiven ? { bsrCode, serial, depositedOn } : undefined,
      // A GST challan is entered on its own screen; edited here, it keeps its deposit details.
      gstChallan: voucher?.gstChallan,
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
    const res = await serverSave(() => saveVoucher(record), tr(status === 'draft' ? 'books:vouchers.draftSaved' : isDraft ? 'books:vouchers.posted' : 'books:vouchers.saved'), { icon: 'swap-horizontal', detail: tr(`books:vouchers.kind.${kind}`) });
    if (res) onSaved(res.id ?? record.id);
  };

  // The chart names the accounts and lists the picks; without it they'd read as raw keys or "Pick account".
  if (!loaded) return <LoadingView variant="items-form" keepTitle />;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer style={{ maxWidth: 1100 }}>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {voucher ? null : (
            <Segmented
              options={KINDS.map((k) => ({ value: k, label: tr(`books:vouchers.kind.${k}`) }))}
              value={kind}
              onChange={(v) => {
                setKind(v as VoucherKind);
                // Nothing typed yet: start over with the rows the new kind starts with.
                if (lines.every(isBlank)) setLines(blankLines(v as VoucherKind));
              }}
            />
          )}
          {voucher || !templates.length ? null : (
            <Button title={tr('books:templates.use')} icon="content-copy" variant="secondary" size="sm" onPress={() => setTemplatesOpen(true)} />
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
            accountOptions={accountOptions}
            onPickAccount={setPicking}
            onPatch={patchLine}
            onRemove={(id) => setLines((ls) => ls.filter((x) => x.id !== id))}
            onAdd={() => setLines((ls) => [...ls, gridLine(debit > credit ? 'cr' : 'dr')])}
          />
          {/* A voucher not yet begun has nothing wrong with it yet: the problem shows once a line is started. */}
          {problem && lines.some((l) => l.account || minor(l.amount)) ? (
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
          {lines.some((l) => l.account) ? <Button title={tr('books:templates.save')} icon="content-save-outline" variant="ghost" size="sm" onPress={() => setTemplateName(narration.trim().slice(0, 60))} /> : null}
        </ScrollView>
        <FormActions>
          {/* A posted voucher stays posted; a new one or a draft can be kept as a draft. */}
          {!voucher || isDraft ? (
            <Button title={tr('books:vouchers.saveDraft')} variant="ghost" onPress={() => void save('draft')} loading={saving} disabled={blocked || !!draftProblem} fullWidth />
          ) : null}
          <Button title={tr(isDraft ? 'books:vouchers.post' : 'books:vouchers.save')} onPress={() => void save('posted')} loading={saving} disabled={blocked || !!problem} fullWidth shortcut="S" />
        </FormActions>
      </FormContainer>

      <SelectSheet
        visible={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title={tr('books:templates.use')}
        options={templates.map((x) => ({ value: x.id, label: x.name, description: x.narration }))}
        value={undefined}
        onSelect={(id) => {
          const tpl = templates.find((x) => x.id === id);
          if (!tpl) return;
          // The template's accounts and sides; amounts it leaves out are filled in now.
          setKind(tpl.kind);
          if (tpl.narration) setNarration(tpl.narration);
          setLines([...tpl.lines.map((l) => ({ id: uid('vl'), side: l.side, account: l.account, amount: l.amount ? String(toMajor(l.amount)) : '', narration: l.narration, costCentreId: l.costCentreId })), gridLine()]);
        }}
      />
      <Sheet visible={templateName !== null} onClose={() => setTemplateName(null)} title={tr('books:templates.save')}>
        <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.lg }}>
          <TextField label={tr('books:templates.name')} value={templateName ?? ''} onChangeText={setTemplateName} maxLength={100} />
          <Button
            title={tr('books:templates.save')}
            disabled={!templateName?.trim() || saving}
            onPress={async () => {
              const record: VoucherTemplate = {
                id: uid('vtp'),
                companyId: company.id,
                name: templateName!.trim(),
                kind,
                narration: narration.trim() || undefined,
                lines: lines.filter((l) => l.account).map((l) => ({ account: l.account, side: l.side, ...(minor(l.amount) ? { amount: money(minor(l.amount), baseCurrency) } : {}), ...(l.narration?.trim() && { narration: l.narration.trim() }), ...(l.costCentreId && { costCentreId: l.costCentreId }) })),
              };
              const res = await serverSave(() => saveTemplate(record), tr('books:templates.saved'), { icon: 'content-copy', detail: record.name });
              if (res) setTemplateName(null);
            }}
          />
        </View>
      </Sheet>
      <SelectSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={tr('books:vouchers.pickAccount')}
        options={accountOptions}
        value={lines.find((l) => l.id === picking)?.account}
        onSelect={(account) => picking && patchLine(picking, { account })}
      />
    </KeyboardAvoidingView>
  );
}
