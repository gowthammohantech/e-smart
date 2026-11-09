import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { AmountField, Segmented, TextField } from '@esmart/ui/components/Field';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { budgetMonths, budgetable, spreadEvenly } from '@esmart/core/domain/budgets';
import { accountFor, chartOfAccounts } from '@esmart/core/domain/ledger/accounts';
import { addDaysISO, financialYearOf, formatDate, today } from '@esmart/core/lib/date';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { useCanWrite } from '../../remote/connectivity';
import { describeError } from '../../remote/errors';
import { removeBudget, saveBudget, type Budget } from '../../remote/budgets';
import { useServerBook } from '../../remote/queries';
import { LoadingView } from '../../components/LoadingView';
import { useActiveCompany, useBaseCurrency } from '../../store/selectors';
import { useAccountName, useGroupName } from './names';

type Row = { account: string; months: string[]; open: boolean };

/**
 * A budget: a name, the financial year it plans, and a figure for each income and expense account.
 * An annual figure is spread evenly over the months; any month can be set on its own.
 */
export function BudgetForm({ budget }: { budget?: Budget }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['books', 'common']);
  const company = useActiveCompany();
  const currency = useBaseCurrency();
  const canWrite = useCanWrite();
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const groupName = useGroupName();
  const fy = financialYearOf(today(), company.fiscalYearStartMonth);
  const next = financialYearOf(addDaysISO(fy.end, 1), company.fiscalYearStartMonth);
  const major = (minor: number) => (minor ? String(toMajor(money(minor, currency))) : '');
  const minor = (v: string) => (v ? fromMajor(v, currency).minor : 0);

  const [name, setName] = useState(budget?.name ?? tr('books:budgets.defaultName', { year: fy.label }));
  const [yearFrom, setYearFrom] = useState(budget?.yearFrom ?? fy.start);
  const [rows, setRows] = useState<Row[]>(budget?.lines.map((l) => ({ account: l.account, months: l.months.map(major), open: false })) ?? []);
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const months = budgetMonths(yearFrom);

  const accounts = useMemo(() => chartOfAccounts(book).filter((a) => budgetable(a.key, book) && !rows.some((r) => r.account === a.key)), [book, rows]);
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const annual = (r: Row) => r.months.reduce((s, m) => s + minor(m), 0);

  const save = async () => {
    setBusy(true);
    try {
      const out = await saveBudget({
        ...(budget?.id && { id: budget.id, version: budget.version }),
        name: name.trim(),
        yearFrom,
        branchId: budget?.branchId,
        costCentreId: budget?.costCentreId,
        lines: rows.map((r) => ({ account: r.account, months: r.months.map(minor) })),
      } as Budget);
      toast.show(tr('books:budgets.saved'), 'success');
      router.replace(`/(app)/books/budgets/${out.id}` as never);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setConfirmRemove(false);
    setBusy(true);
    try {
      await removeBudget(budget!);
      toast.show(tr('books:budgets.removed'), 'success');
      router.replace('/(app)/books/budgets' as never);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  // The chart names the accounts and lists the picks; without it they'd read as raw keys or "Pick account".
  if (!loaded) return <LoadingView variant="form" keepTitle />;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer style={{ maxWidth: '100%' }}>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: t.spacing.lg }}>
            <TextField label={tr('books:budgets.name')} value={name} onChangeText={setName} required maxLength={200} />
            {budget?.id ? (
              <Text variant="small" tone="muted">
                {tr('books:budgets.for', { year: financialYearOf(yearFrom, company.fiscalYearStartMonth).label })}
              </Text>
            ) : (
              <Segmented options={[{ value: fy.start, label: fy.label }, { value: next.start, label: next.label }]} value={yearFrom} onChange={setYearFrom} />
            )}
          </Card>
          {rows.map((r, i) => {
            const a = accountFor(r.account, book);
            return (
              <Card key={r.account} style={{ gap: t.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="600">
                      {a ? nameOf(a) : r.account}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {a ? groupName(a.group) : ''}
                    </Text>
                  </View>
                  <Button size="sm" variant="ghost" icon="delete-outline" title={tr('books:budgets.removeLine')} onPress={() => setRows((rs) => rs.filter((_, k) => k !== i))} />
                </View>
                <AmountField
                  label={tr('books:budgets.annual')}
                  value={major(annual(r))}
                  onChangeValue={(v) => patch(i, { months: spreadEvenly(minor(v)).map(major) })}
                  currency={currency}
                  hint={tr('books:budgets.annualHint')}
                />
                <Button size="sm" variant="ghost" icon={r.open ? 'chevron-up' : 'chevron-down'} title={tr(r.open ? 'books:budgets.hideMonths' : 'books:budgets.showMonths')} onPress={() => patch(i, { open: !r.open })} />
                {r.open ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
                    {months.map((m, k) => (
                      <View key={m} style={{ flexBasis: 150, flexGrow: 1 }}>
                        <AmountField label={formatDate(m, 'MMM yyyy')} value={r.months[k]} onChangeValue={(v) => patch(i, { months: r.months.map((x, j) => (j === k ? v : x)) })} currency={currency} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
          <Button title={tr('books:budgets.addLine')} icon="plus" variant="secondary" onPress={() => setPicking(true)} disabled={!accounts.length} />
          {budget?.id ? <Button title={tr('books:budgets.remove')} variant="danger" icon="delete-outline" onPress={() => setConfirmRemove(true)} disabled={!canWrite || busy} /> : null}
        </ScrollView>
        <FormActions>
          <Button title={tr('books:budgets.save')} onPress={() => void save()} loading={busy} disabled={!canWrite || busy || !name.trim()} fullWidth shortcut="S" />
        </FormActions>
      </FormContainer>
      <SelectSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={tr('books:budgets.addLine')}
        options={accounts.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) }))}
        onSelect={(v) => {
          setRows((rs) => [...rs, { account: v, months: Array(12).fill(''), open: false }]);
          setPicking(false);
        }}
      />
      <ConfirmDialog
        visible={confirmRemove}
        destructive
        title={tr('books:budgets.removeTitle', { name: budget?.name ?? '' })}
        message={tr('books:budgets.removeBody')}
        confirmLabel={tr('books:budgets.remove')}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />
    </KeyboardAvoidingView>
  );
}
