import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Stepper } from '@/components/Stepper';
import { EmptyState } from '@/components/EmptyState';
import { TotalsPanel } from '@/components/TotalsPanel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { Avatar } from '@/components/Avatar';

import { DocumentKind, DocumentLine, Party } from '@/types';
import { documentKindLabel } from '@/i18n/labels';
import { resolveRate } from '@/domain/fx';
import { CURRENCIES } from '@/lib/currencies';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { addDaysISO } from '@/lib/date';
import { fromMajor, money, toMajor } from '@/lib/money';
import { INDIAN_STATES } from '@/data/masters';

import { useAppStore } from '@/store/appStore';
import {
  useActiveCompany,
  useBaseCurrency,
  useBranches,
  useExchangeRates,
  useHasModule,
  useItems,
  useParties,
  useTaxCategories,
} from '@/store/selectors';
import {
  DraftState,
  blankLine,
  emptyDraft,
  lineFromItem,
  useDocumentDraft,
} from './useDocumentDraft';
import { LineEditorSheet } from './LineEditorSheet';

/** Editor step keys, in order. Names live in `common:editorStep.*`. */
const STEPS = ['party', 'items', 'extras', 'review'] as const;

const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'];

export function DocumentEditor({
  kind,
  documentId,
  initialDraft,
  prefill,
  onSaved,
}: {
  kind: DocumentKind;
  documentId?: string;
  initialDraft?: DraftState;
  /** Party, and optionally one item line, to start from (Siri / Shortcuts). */
  prefill?: { partyId: string; itemId?: string; quantity?: number };
  onSaved?: (id: string) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'sales']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const hasFx = useHasModule('fx');
  const branches = useBranches();
  const taxCategories = useTaxCategories();
  const exchangeRates = useExchangeRates();
  const isPurchase = PURCHASE_KINDS.includes(kind);
  const parties = useParties(isPurchase ? 'supplier' : 'customer');
  const items = useItems({ activeOnly: true });

  const createDocument = useAppStore((s) => s.createDocument);
  const updateDocument = useAppStore((s) => s.updateDocument);
  const setDocumentStatus = useAppStore((s) => s.setDocumentStatus);
  const nextNumberFor = useAppStore((s) => s.nextNumberFor);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const taxContext = useMemo(
    () => ({
      regime: company?.taxRegistration?.regime ?? ('NONE' as const),
      homeStateCode: company?.taxRegistration?.placeOfSupplyStateCode,
      placeOfSupplyStateCode: company?.taxRegistration?.placeOfSupplyStateCode,
      registered: !!company?.taxRegistration?.registered,
    }),
    [company],
  );

  /** What choosing a party sets on the draft; shared by the picker and `prefill`. */
  const partyFields = (p: Party, date: string, dueDate?: string): Partial<DraftState> => ({
    partyId: p.id,
    placeOfSupplyStateCode: p.billingAddress.stateCode,
    currency: p.currency,
    exchangeRate: p.currency === baseCurrency ? 1 : resolveRate(exchangeRates, p.currency, baseCurrency, date),
    dueDate: kind === 'invoice' || kind === 'purchaseBill' ? addDaysISO(date, p.paymentTermsDays) : dueDate,
  });

  // A prefill seeds the draft and the opening step, as if the person had
  // picked the party and item by hand. Read once, like `initialDraft`.
  const [seed] = useState(() => {
    if (!prefill) return null;
    const p = parties.find((x) => x.id === prefill.partyId);
    if (!p) return { missingParty: true, draft: undefined, step: 0 };
    const base = emptyDraft(baseCurrency, kind);
    const item = prefill.itemId ? items.find((i) => i.id === prefill.itemId) : undefined;
    const lines = item
      ? [{ ...lineFromItem(item, isPurchase, taxCategories), quantity: prefill.quantity ?? 1 }]
      : [];
    return {
      missingParty: false,
      draft: { ...base, ...partyFields(p, base.date, base.dueDate), lines },
      step: STEPS.indexOf(item ? 'review' : 'items'),
    };
  });

  const { draft, patch, addLine, updateLine, removeLine, setCurrency, totals } = useDocumentDraft({
    kind,
    baseCurrency,
    taxCategories,
    taxContext,
    initial: initialDraft ?? seed?.draft,
  });

  const [step, setStep] = useState(seed?.step ?? 0);
  const [partyOpen, setPartyOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<DocumentLine | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [chargesText, setChargesText] = useState(String(toMajor(draft.charges) || ''));
  const [discountText, setDiscountText] = useState(String(draft.documentDiscountValue || ''));

  const kindName = documentKindLabel(tr, kind, 1);
  const party = parties.find((p) => p.id === draft.partyId);
  const branch = branches.find((b) => b.id === (draft.branchId ?? activeBranchId));

  const interState =
    taxContext.regime === 'GST' &&
    !!taxContext.homeStateCode &&
    !!draft.placeOfSupplyStateCode &&
    taxContext.homeStateCode !== draft.placeOfSupplyStateCode;

  const canAdvance = step === 0 ? !!draft.partyId : step === 1 ? draft.lines.length > 0 : true;

  const pickParty = (id: string) => {
    const p = parties.find((x) => x.id === id);
    if (!p) return;
    patch(partyFields(p, draft.date, draft.dueDate));
  };

  useEffect(() => {
    if (seed?.missingParty) toast.show(tr('common:documentEditor.prefillMissingParty'), 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (finalize: boolean) => {
    if (!draft.partyId) return;

    const payload = {
      kind,
      partyId: draft.partyId,
      date: draft.date,
      dueDate: draft.dueDate,
      validUntil: draft.validUntil,
      currency: draft.currency,
      exchangeRate: draft.exchangeRate,
      lines: draft.lines,
      documentDiscountMode: draft.documentDiscountMode,
      documentDiscountValue: draft.documentDiscountValue,
      charges: draft.charges,
      applyRoundOff: draft.applyRoundOff,
      notes: draft.notes || undefined,
      terms: draft.terms || undefined,
      reference: draft.reference || undefined,
      supplierDocNumber: draft.supplierDocNumber || undefined,
      placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
      branchId: draft.branchId ?? activeBranchId ?? undefined,
      attachmentIds: draft.attachmentIds,
    };

    let id = documentId;
    if (documentId) {
      updateDocument(documentId, payload);
    } else {
      id = createDocument({ ...payload, status: 'draft' });
    }
    if (!id) return;

    if (finalize) {
      const target =
        kind === 'quote'
          ? 'sent'
          : kind === 'salesOrder' || kind === 'purchaseOrder'
            ? 'confirmed'
            : kind === 'delivery'
              ? 'delivered'
              : kind === 'goodsReceipt'
                ? 'received'
                : kind === 'salesReturn' || kind === 'purchaseReturn'
                  ? 'approved'
                  : 'issued';
      setDocumentStatus(id, target);
    }

    toast.show(
      finalize
        ? tr('common:documentEditor.finalised', { kind: kindName })
        : tr('common:documentEditor.savedDraft'),
      'success',
    );
    if (onSaved) onSaved(id);
    else router.replace(detailRouteFor(kind, id) as never);
  };

  /* ---------------------------------------------------------------- */

  const renderParty = () => (
    <View style={{ gap: t.spacing.lg }}>
      <Pressable
        onPress={() => setPartyOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={party ? `Change ${isPurchase ? 'supplier' : 'customer'}` : `Select ${isPurchase ? 'supplier' : 'customer'}`}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          {party ? (
            <>
              <Avatar name={party.name} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="body" weight="600">
                  {party.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {party.taxId ?? party.phone ?? party.email ?? party.code}
                </Text>
                <View style={{ flexDirection: 'row', gap: 5, marginTop: 2 }}>
                  <Badge label={`${party.paymentTermsDays}d terms`} tone="neutral" size="sm" />
                  {party.currency !== baseCurrency ? <Badge label={party.currency} tone="info" size="sm" /> : null}
                </View>
              </View>
            </>
          ) : (
            <>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="account-plus-outline" size={22} color={t.c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  Select {isPurchase ? 'supplier' : 'customer'}
                </Text>
                <Text variant="caption" tone="muted">{tr('sales:editor.partySearch')}</Text>
              </View>
            </>
          )}
          <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
        </Card>
      </Pressable>

      <DateField
        label={tr('common:documentEditor.dateLabel', { kind: kindName })}
        value={draft.date}
        onChange={(date) => patch({ date })}
        required
      />

      {kind === 'invoice' || kind === 'purchaseBill' ? (
        <DateField
          label={tr('sales:editor.dueDate')}
          value={draft.dueDate ?? addDaysISO(draft.date, 30)}
          onChange={(dueDate) => patch({ dueDate })}
          hint={party ? `${party.name} is on ${party.paymentTermsDays}-day terms.` : undefined}
        />
      ) : null}

      {kind === 'quote' ? (
        <DateField
          label={tr('sales:editor.validUntil')}
          value={draft.validUntil ?? addDaysISO(draft.date, 15)}
          onChange={(validUntil) => patch({ validUntil })}
        />
      ) : null}

      {isPurchase ? (
        <TextField
          label={tr('sales:editor.supplierDocNumber')}
          value={draft.supplierDocNumber}
          onChangeText={(supplierDocNumber) => patch({ supplierDocNumber })}
          placeholder={tr('sales:editor.supplierDocPlaceholder')}
          icon="pound"
        />
      ) : null}

      <TextField
        label={tr('sales:editor.reference')}
        value={draft.reference}
        onChangeText={(reference) => patch({ reference })}
        placeholder={tr('sales:editor.referencePlaceholder')}
        icon="link-variant"
      />

      {branches.length > 1 ? (
        <PickerField label={tr('sales:editor.branch')} value={branch?.name} onPress={() => setBranchOpen(true)} icon="warehouse" />
      ) : null}

      {taxContext.regime === 'GST' ? (
        <PickerField
          label={tr('sales:editor.placeOfSupply')}
          value={INDIAN_STATES.find((s) => s.code === draft.placeOfSupplyStateCode)?.name}
          onPress={() => setPosOpen(true)}
          icon="map-marker-outline"
          hint={interState ? 'Inter-state supply — IGST applies.' : 'Intra-state supply — CGST + SGST apply.'}
        />
      ) : null}

      {/* Multi-currency is a full-plan module; a document already in another currency still shows it. */}
      {hasFx || draft.currency !== baseCurrency ? (
        <PickerField
          label={tr('sales:editor.currency')}
          value={`${draft.currency}${draft.currency !== baseCurrency ? ` · 1 ${draft.currency} = ${draft.exchangeRate.toFixed(4)} ${baseCurrency}` : ''}`}
          onPress={() => setCurrencyOpen(true)}
          icon="cash-multiple"
        />
      ) : null}

      {draft.currency !== baseCurrency ? (
        <TextField
          label={`Exchange rate (1 ${draft.currency} → ${baseCurrency})`}
          value={String(draft.exchangeRate)}
          onChangeText={(v) => patch({ exchangeRate: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
          keyboardType="decimal-pad"
          icon="swap-horizontal"
          hint={tr('sales:editor.rateStored')}
        />
      ) : null}
    </View>
  );

  const renderItems = () => (
    <View style={{ gap: t.spacing.md }}>
      <Button title={tr('sales:editor.addItem')} icon="plus" variant="secondary" onPress={() => setItemOpen(true)} fullWidth />

      {draft.lines.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="tag-outline"
            title={tr('sales:editor.noLines')}
            message={tr('sales:editor.noLinesBody')}
            actionLabel={tr('sales:editor.addItem')}
            onAction={() => setItemOpen(true)}
            compact
          />
        </Card>
      ) : (
        <Card padded={false}>
          {draft.lines.map((line, i) => {
            const lineTotal = money(
              Math.round(line.unitPrice.minor * line.quantity * (1 - (line.discountMode === 'percent' ? line.discountValue / 100 : 0))),
              draft.currency,
            );
            return (
              <Pressable
                key={line.id}
                onPress={() => setEditingLine(line)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${line.name}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < draft.lines.length - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                  backgroundColor: pressed ? t.c.card2 : 'transparent',
                })}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="body" weight="600" numberOfLines={1}>
                    {line.name || 'Untitled line'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatQty(line.quantity)} {line.unit} × {formatMoney(line.unitPrice)}
                    {line.discountValue > 0
                      ? ` · −${line.discountMode === 'percent' ? formatPercent(line.discountValue) : formatMoney(money(line.discountValue * 100, draft.currency))}`
                      : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 5, marginTop: 2 }}>
                    <Badge label={formatPercent(line.taxRate)} tone="neutral" size="sm" />
                    {line.taxInclusive ? <Badge label={tr('sales:editor.inclusive')} tone="info" size="sm" /> : null}
                    {line.hsnCode ? <Badge label={`HSN ${line.hsnCode}`} tone="neutral" size="sm" /> : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatMoney(lineTotal)}
                  </Text>
                  <MaterialCommunityIcons name="pencil-outline" size={15} color={t.c.muted} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      {draft.lines.length > 0 ? (
        <Card>
          <TotalsPanel
            totals={totals}
            currency={draft.currency}
            baseCurrency={baseCurrency}
            exchangeRate={draft.exchangeRate}
            compact
          />
        </Card>
      ) : null}
    </View>
  );

  const renderExtras = () => (
    <View style={{ gap: t.spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text variant="caption" tone="muted" weight="600">{tr('sales:editor.discountOnTotal')}</Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Segmented
            options={[
              { value: 'percent', label: '%' },
              { value: 'amount', label: draft.currency },
            ]}
            value={draft.documentDiscountMode}
            onChange={(v) => patch({ documentDiscountMode: v as 'percent' | 'amount' })}
            style={{ width: 130 }}
            size="sm"
          />
          <TextField
            value={discountText}
            onChangeText={(v) => {
              const clean = v.replace(/[^0-9.]/g, '');
              setDiscountText(clean);
              patch({ documentDiscountValue: Number(clean) || 0 });
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={{ flex: 1 }}
          />
        </View>
      </View>

      <AmountField
        label={tr('sales:editor.otherCharges')}
        value={chargesText}
        onChangeValue={(v) => {
          setChargesText(v);
          patch({ charges: fromMajor(v || '0', draft.currency) });
        }}
        currency={draft.currency}
        hint={tr('sales:editor.otherChargesHint')}
      />

      <SwitchField
        label={tr('sales:editor.roundOff')}
        description={tr('sales:editor.roundOffHint')}
        value={draft.applyRoundOff}
        onValueChange={(applyRoundOff) => patch({ applyRoundOff })}
      />

      <TextField
        label={tr('sales:editor.notes')}
        value={draft.notes}
        onChangeText={(notes) => patch({ notes })}
        placeholder={tr('sales:editor.notesHint')}
        multiline
      />

      <TextField
        label={tr('sales:editor.terms')}
        value={draft.terms}
        onChangeText={(terms) => patch({ terms })}
        placeholder={tr('sales:editor.termsPlaceholder')}
        multiline
      />

      <Card>
        <TotalsPanel
          totals={totals}
          currency={draft.currency}
          baseCurrency={baseCurrency}
          exchangeRate={draft.exchangeRate}
          compact
        />
      </Card>
    </View>
  );

  const renderReview = () => (
    <View style={{ gap: t.spacing.lg }}>
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 3 }}>
            <Text variant="caption" tone="muted">
              {tr('common:documentEditor.numberLabel', { kind: kindName })}
            </Text>
            <Text variant="title" weight="700">
              {documentId ? '—' : nextNumberFor(kind as never)}
            </Text>
          </View>
          <Badge label={interState ? 'IGST' : taxContext.regime === 'GST' ? 'CGST + SGST' : 'No tax'} tone="info" />
        </View>

        <View style={{ height: 1, backgroundColor: t.c.line }} />

        {[
          { label: isPurchase ? 'Supplier' : 'Customer', value: party?.name ?? '—' },
          { label: 'Date', value: draft.date },
          ...(draft.dueDate ? [{ label: 'Due', value: draft.dueDate }] : []),
          ...(draft.validUntil ? [{ label: tr('sales:editor.validUntil'), value: draft.validUntil }] : []),
          { label: tr('sales:editor.branch'), value: branch?.name ?? '—' },
          { label: 'Lines', value: String(draft.lines.length) },
        ].map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small" tone="muted">
              {r.label}
            </Text>
            <Text variant="small" weight="600">
              {r.value}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <TotalsPanel
          totals={totals}
          currency={draft.currency}
          baseCurrency={baseCurrency}
          exchangeRate={draft.exchangeRate}
        />
      </Card>

      <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
        <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
          Finalising assigns a permanent number that is never reused
          {kind === 'invoice' || kind === 'delivery' ? ' and posts stock movements for tracked items' : ''}. Drafts can
          still be edited freely.
        </Text>
      </Card>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.sm }}>
        <Stepper steps={STEPS.map((k) => tr(`common:editorStep.${k}` as 'common:editorStep.party'))} current={step} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? renderParty() : step === 1 ? renderItems() : step === 2 ? renderExtras() : renderReview()}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.md,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          gap: t.spacing.sm,
        }}
      >
        {draft.lines.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <Text variant="caption" tone="muted">{tr('sales:editor.total')}</Text>
            <Text variant="title" weight="700">
              {formatMoney(totals.grandTotal)}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {step > 0 ? (
            <Button title={tr('sales:editor.back')} variant="ghost" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button
              title={tr('sales:editor.continue')}
              onPress={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              style={{ flex: 2 }}
            />
          ) : (
            <>
              <Button title={tr('sales:editor.saveDraft')} variant="ghost" onPress={() => save(false)} style={{ flex: 1 }} />
              <Button title={tr('sales:editor.finalise')} onPress={() => setConfirmFinalize(true)} style={{ flex: 1 }} />
            </>
          )}
        </View>
      </View>

      {/* ---------------- sheets ---------------- */}

      <SelectSheet
        visible={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={isPurchase ? 'Select supplier' : 'Select customer'}
        options={parties.map((p) => ({
          value: p.id,
          label: p.name,
          description: [p.displayName, p.taxId, p.phone].filter(Boolean).join(' · '),
          trailing: p.currency !== baseCurrency ? p.currency : undefined,
        }))}
        value={draft.partyId}
        onSelect={pickParty}
        searchPlaceholder={isPurchase ? 'Search suppliers' : 'Search customers'}
        footer={
          <Button
            title={isPurchase ? 'Add new supplier' : 'Add new customer'}
            variant="secondary"
            icon="plus"
            fullWidth
            onPress={() => {
              setPartyOpen(false);
              router.push(isPurchase ? '/(app)/contacts/suppliers/new' : '/(app)/contacts/customers/new');
            }}
          />
        }
      />

      <SelectSheet
        visible={itemOpen}
        onClose={() => setItemOpen(false)}
        title={tr('sales:editor.addItem')}
        options={items.map((i) => ({
          value: i.id,
          label: i.name,
          description: `${i.sku} · ${formatMoney(isPurchase ? i.purchasePrice : i.salePrice)} / ${i.unit}`,
          trailing: formatPercent(taxCategories.find((c) => c.id === i.taxCategoryId)?.rate ?? 0),
        }))}
        onSelect={(id) => {
          const item = items.find((i) => i.id === id);
          if (item) addLine(lineFromItem(item, isPurchase, taxCategories));
        }}
        searchPlaceholder="Search by name or SKU"
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Button
              title={tr('sales:editor.oneOffLine')}
              variant="ghost"
              icon="pencil-plus-outline"
              style={{ flex: 1 }}
              onPress={() => {
                const line = blankLine(draft.currency, taxCategories);
                addLine(line);
                setItemOpen(false);
                setEditingLine(line);
              }}
            />
            <Button
              title={tr('sales:editor.newItem')}
              variant="secondary"
              icon="plus"
              style={{ flex: 1 }}
              onPress={() => {
                setItemOpen(false);
                router.push('/(app)/catalog/items/new');
              }}
            />
          </View>
        }
      />

      <SelectSheet
        visible={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        title={tr('sales:editor.documentCurrency')}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={draft.currency}
        onSelect={(code) =>
          setCurrency(code, code === baseCurrency ? 1 : resolveRate(exchangeRates, code, baseCurrency, draft.date))
        }
      />

      <SelectSheet
        visible={posOpen}
        onClose={() => setPosOpen(false)}
        title={tr('sales:editor.placeOfSupply')}
        subtitle={tr('sales:editor.posHint')}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={draft.placeOfSupplyStateCode}
        onSelect={(placeOfSupplyStateCode) => patch({ placeOfSupplyStateCode })}
      />

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={tr('sales:editor.branch')}
        options={branches.map((b) => ({ value: b.id, label: b.name, description: b.code }))}
        value={draft.branchId ?? activeBranchId}
        onSelect={(branchId) => patch({ branchId })}
        searchable={false}
      />

      <LineEditorSheet
        visible={!!editingLine}
        line={editingLine}
        currency={draft.currency}
        taxCategories={taxCategories}
        taxContext={{ ...taxContext, placeOfSupplyStateCode: draft.placeOfSupplyStateCode }}
        onClose={() => setEditingLine(null)}
        onSave={(p) => editingLine && updateLine(editingLine.id, p)}
        onRemove={() => editingLine && removeLine(editingLine.id)}
      />

      <ConfirmDialog
        visible={confirmFinalize}
        title={tr('common:documentEditor.finaliseTitle', { kind: kindName })}
        message={tr('common:documentEditor.finaliseMessage', { kind: kindName })}
        confirmLabel={tr('sales:editor.finalise')}
        icon="check-decagram-outline"
        onCancel={() => setConfirmFinalize(false)}
        onConfirm={() => {
          setConfirmFinalize(false);
          save(true);
        }}
      />
    </KeyboardAvoidingView>
  );
}

export function detailRouteFor(kind: DocumentKind, id: string): string {
  const map: Record<DocumentKind, string> = {
    invoice: '/(app)/sales/invoices',
    quote: '/(app)/sales/quotes',
    salesOrder: '/(app)/sales/orders',
    delivery: '/(app)/sales/deliveries',
    salesReturn: '/(app)/sales/returns',
    purchaseOrder: '/(app)/purchases/orders',
    goodsReceipt: '/(app)/purchases/receipts',
    purchaseBill: '/(app)/purchases/bills',
    purchaseReturn: '/(app)/purchases/returns',
  };
  return `${map[kind]}/${id}`;
}

export function listRouteFor(kind: DocumentKind): string {
  return detailRouteFor(kind, '').replace(/\/$/, '');
}

export { emptyDraft };
