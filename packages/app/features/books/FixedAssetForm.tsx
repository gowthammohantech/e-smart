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
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { FormContainer } from '@esmart/ui/components/Layout';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { chartOfAccounts } from '@esmart/core/domain/ledger/accounts';
import { addDaysISO, financialYearOf, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { useCanWrite } from '../../remote/connectivity';
import { describeError } from '../../remote/errors';
import { removeFixedAsset, saveFixedAsset, type FixedAsset } from '../../remote/fixedAssets';
import { useServerBook } from '../../remote/queries';
import { useActiveCompany, useBaseCurrency } from '../../store/selectors';
import { useAccountName } from './names';

const CATEGORIES = ['plant', 'computers', 'furniture', 'vehicles', 'office', 'buildings'] as const;

/**
 * Adds an asset to the register, or edits one: what it cost and where that sits in the books, when it
 * was put to use, and how it wears out. An existing one can be disposed of, or taken out of the register.
 */
export function FixedAssetForm({ asset }: { asset?: FixedAsset }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['books', 'common']);
  const company = useActiveCompany();
  const currency = useBaseCurrency();
  const canWrite = useCanWrite();
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const major = (m?: { minor: number; currency: string }) => (m && m.minor ? String(toMajor(m)) : '');

  const [name, setName] = useState(asset?.name ?? '');
  const [category, setCategory] = useState(asset?.category ?? '');
  const [assetCode, setAssetCode] = useState(asset?.assetCode ?? '');
  const [account, setAccount] = useState(asset?.account ?? 'sys:fixedAssets');
  const [acquiredOn, setAcquiredOn] = useState(asset?.acquiredOn ?? today());
  const [inUseFrom, setInUseFrom] = useState(asset?.inUseFrom ?? today());
  const [cost, setCost] = useState(major(asset?.cost));
  const [residual, setResidual] = useState(major(asset?.residualValue));
  const [method, setMethod] = useState<'slm' | 'wdv'>(asset?.method ?? 'slm');
  const [lifeYears, setLifeYears] = useState(asset?.lifeMonths ? String(+(asset.lifeMonths / 12).toFixed(2)) : '5');
  const [rate, setRate] = useState(asset?.rate ? String(asset.rate) : '15');
  const [brought, setBrought] = useState(!!asset?.openingDepreciation?.minor);
  const [openingDep, setOpeningDep] = useState(major(asset?.openingDepreciation));
  const [openingAsOf, setOpeningAsOf] = useState(asset?.openingAsOf ?? addDaysISO(financialYearOf(today(), company.fiscalYearStartMonth).start, -1));
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const [disposing, setDisposing] = useState(!!asset?.disposedOn);
  const [disposedOn, setDisposedOn] = useState(asset?.disposedOn ?? today());
  const [disposalNote, setDisposalNote] = useState(asset?.disposalNote ?? '');
  const [picking, setPicking] = useState<'account' | 'category' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  // Its cost sits in a fixed-asset account: Plant and machinery, or one of the business's own.
  const accounts = useMemo(() => chartOfAccounts(book).filter((a) => a.group === 'fixedAssets' && a.key !== 'sys:accumulatedDepreciation'), [book]);
  const chosen = accounts.find((a) => a.key === account);
  const minor = (v: string) => (v ? fromMajor(v, currency).minor : 0);
  const months = Math.round(Number(lifeYears) * 12);
  const problem =
    !name.trim() ? tr('books:assets.needName')
    : minor(cost) <= 0 ? tr('books:assets.needCost')
    : inUseFrom < acquiredOn ? tr('books:assets.inUseBeforeAcquired')
    : method === 'slm' && !(months > 0) ? tr('books:assets.needLife')
    : method === 'wdv' && !(Number(rate) > 0 && Number(rate) <= 100) ? tr('books:assets.needRate')
    : undefined;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    try {
      const body = {
        ...(asset?.id && { id: asset.id, version: asset.version }),
        name: name.trim(),
        category: category.trim() || undefined,
        assetCode: assetCode.trim() || undefined,
        account,
        acquiredOn,
        inUseFrom,
        cost: money(minor(cost), currency),
        residualValue: money(minor(residual), currency),
        method,
        ...(method === 'slm' ? { lifeMonths: months } : { rate: Number(rate) }),
        openingDepreciation: money(brought ? minor(openingDep) : 0, currency),
        ...(brought && { openingAsOf }),
        notes: notes.trim() || undefined,
        ...(disposing && { disposedOn, disposalNote: disposalNote.trim() || undefined }),
        sourceDocumentId: asset?.sourceDocumentId,
        costCentreId: asset?.costCentreId,
        branchId: asset?.branchId,
      } as FixedAsset;
      const out = await saveFixedAsset(body);
      toast.show(tr(asset?.id ? 'books:assets.saved' : 'books:assets.added'), 'success');
      if (!asset?.id) router.replace(`/(app)/books/fixed-assets/${out.id}` as never);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!asset?.id) return;
    setConfirmRemove(false);
    setBusy(true);
    try {
      await removeFixedAsset(asset);
      toast.show(tr('books:assets.removed'), 'success');
      router.replace('/(app)/books/fixed-assets' as never);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: t.spacing.lg }}>
            <TextField label={tr('books:assets.name')} value={name} onChangeText={setName} placeholder={tr('books:assets.namePlaceholder')} required maxLength={200} />
            <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <PickerField label={tr('books:assets.category')} value={category || undefined} placeholder={tr('books:assets.optional')} onPress={() => setPicking('category')} icon="shape-outline" />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <TextField label={tr('books:assets.code')} value={assetCode} onChangeText={setAssetCode} placeholder={tr('books:assets.codePlaceholder')} maxLength={60} />
              </View>
            </View>
            <PickerField label={tr('books:assets.account')} required value={chosen ? nameOf(chosen) : account} onPress={() => setPicking('account')} icon="book-open-variant" hint={tr('books:assets.accountHint')} />
          </Card>

          <Card style={{ gap: t.spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <DateField label={tr('books:assets.acquiredOn')} value={acquiredOn} onChange={setAcquiredOn} required />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <DateField label={tr('books:assets.inUseFrom')} value={inUseFrom} onChange={setInUseFrom} required hint={tr('books:assets.inUseHint')} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <AmountField label={tr('books:assets.cost')} value={cost} onChangeValue={setCost} currency={currency} required hint={tr('books:assets.costHint')} />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <AmountField label={tr('books:assets.residual')} value={residual} onChangeValue={setResidual} currency={currency} hint={tr('books:assets.residualHint')} />
              </View>
            </View>
          </Card>

          <Card style={{ gap: t.spacing.lg }}>
            <Text variant="body" weight="600">
              {tr('books:assets.depreciation')}
            </Text>
            <Segmented options={[{ value: 'slm', label: tr('books:assets.slm') }, { value: 'wdv', label: tr('books:assets.wdv') }]} value={method} onChange={(v) => setMethod(v as 'slm' | 'wdv')} />
            {method === 'slm' ? (
              <TextField label={tr('books:assets.lifeYears')} value={lifeYears} onChangeText={setLifeYears} keyboardType="decimal-pad" required hint={tr('books:assets.slmHint')} />
            ) : (
              <TextField label={tr('books:assets.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" required hint={tr('books:assets.wdvHint')} />
            )}
            <SwitchField label={tr('books:assets.brought')} description={tr('books:assets.broughtHint')} value={brought} onValueChange={setBrought} />
            {brought ? (
              <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <AmountField label={tr('books:assets.openingDep')} value={openingDep} onChangeValue={setOpeningDep} currency={currency} />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <DateField label={tr('books:assets.openingAsOf')} value={openingAsOf} onChange={setOpeningAsOf} />
                </View>
              </View>
            ) : null}
          </Card>

          <Card style={{ gap: t.spacing.lg }}>
            <TextField label={tr('books:assets.notes')} value={notes} onChangeText={setNotes} placeholder={tr('books:assets.optional')} multiline maxLength={2000} />
            {asset?.id ? (
              <>
                <SwitchField label={tr('books:assets.disposed')} description={tr('books:assets.disposedHint')} value={disposing} onValueChange={setDisposing} />
                {disposing ? (
                  <>
                    <DateField label={tr('books:assets.disposedOn')} value={disposedOn} onChange={setDisposedOn} maximumDate={new Date()} />
                    <TextField label={tr('books:assets.disposalNote')} value={disposalNote} onChangeText={setDisposalNote} placeholder={tr('books:assets.disposalNotePlaceholder')} maxLength={500} />
                  </>
                ) : null}
              </>
            ) : null}
          </Card>
          {asset?.id ? <Button title={tr('books:assets.remove')} variant="danger" icon="delete-outline" onPress={() => setConfirmRemove(true)} disabled={!canWrite || busy} /> : null}
        </ScrollView>
        <FormActions>
          {problem ? (
            <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              {problem}
            </Text>
          ) : null}
          <Button title={tr(asset?.id ? 'books:assets.save' : 'books:assets.add')} onPress={() => void save()} loading={busy} disabled={!canWrite || busy || !!problem} fullWidth size="lg" shortcut="S" />
        </FormActions>
      </FormContainer>

      <SelectSheet
        visible={picking === 'account'}
        onClose={() => setPicking(null)}
        title={tr('books:assets.account')}
        options={accounts.map((a) => ({ value: a.key, label: nameOf(a) }))}
        value={account}
        onSelect={(v) => {
          setAccount(v);
          setPicking(null);
        }}
      />
      <SelectSheet
        visible={picking === 'category'}
        onClose={() => setPicking(null)}
        title={tr('books:assets.category')}
        options={CATEGORIES.map((c) => ({ value: tr(`books:assets.categories.${c}`), label: tr(`books:assets.categories.${c}`) }))}
        value={category}
        onSelect={(v) => {
          setCategory(v);
          setPicking(null);
        }}
      />
      <ConfirmDialog
        visible={confirmRemove}
        destructive
        title={tr('books:assets.removeTitle', { name: asset?.name ?? '' })}
        message={tr('books:assets.removeBody', { cost: asset?.cost ? formatMoney(asset.cost) : '' })}
        confirmLabel={tr('books:assets.remove')}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />
    </KeyboardAvoidingView>
  );
}
