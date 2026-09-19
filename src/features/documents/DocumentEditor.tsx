import React, { useMemo, useState } from 'react';
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

import { DocumentKind, DocumentLine } from '@/types';
import { DOCUMENT_LABELS } from '@/domain/documentStates';
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

const STEPS = [
  { key: 'party', label: 'Who' },
  { key: 'items', label: 'What' },
  { key: 'extras', label: 'Tax & terms' },
  { key: 'review', label: 'Review' },
] as const;

const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'];

export function DocumentEditor({
  kind,
  documentId,
  initialDraft,
  onSaved,
}: {
  kind: DocumentKind;
  documentId?: string;
  initialDraft?: DraftState;
  onSaved?: (id: string) => void;
}) {
  const t = useTheme();
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

  const { draft, patch, addLine, updateLine, removeLine, setCurrency, totals } = useDocumentDraft({
    kind,
    baseCurrency,
    taxCategories,
    taxContext,
    initial: initialDraft,
  });

  const [step, setStep] = useState(0);
  const [partyOpen, setPartyOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<DocumentLine | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [chargesText, setChargesText] = useState(String(toMajor(draft.charges) || ''));
  const [discountText, setDiscountText] = useState(String(draft.documentDiscountValue || ''));

  const label = DOCUMENT_LABELS[kind];
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
    const rate = resolveRate(exchangeRates, p.currency, baseCurrency, draft.date);
    patch({
      partyId: id,
      placeOfSupplyStateCode: p.billingAddress.stateCode,
      currency: p.currency,
      exchangeRate: p.currency === baseCurrency ? 1 : rate,
      dueDate:
        kind === 'invoice' || kind === 'purchaseBill'
          ? addDaysISO(draft.date, p.paymentTermsDays)
          : draft.dueDate,
    });
  };

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

    toast.show(finalize ? `${label.singular} finalised` : 'Saved as draft', 'success');
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
                <Text variant="caption" tone="muted">
                  Search your contacts or add a new one
                </Text>
              </View>
            </>
          )}
          <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
        </Card>
      </Pressable>

      <DateField label={`${label.singular} date`} value={draft.date} onChange={(date) => patch({ date })} required />

      {kind === 'invoice' || kind === 'purchaseBill' ? (
        <DateField
          label="Due date"
          value={draft.dueDate ?? addDaysISO(draft.date, 30)}
          onChange={(dueDate) => patch({ dueDate })}
          hint={party ? `${party.name} is on ${party.paymentTermsDays}-day terms.` : undefined}
        />
      ) : null}

      {kind === 'quote' ? (
        <DateField
          label="Valid until"
          value={draft.validUntil ?? addDaysISO(draft.date, 15)}
          onChange={(validUntil) => patch({ validUntil })}
        />
      ) : null}

      {isPurchase ? (
        <TextField
          label="Supplier document number"
          value={draft.supplierDocNumber}
          onChangeText={(supplierDocNumber) => patch({ supplierDocNumber })}
          placeholder="Their bill number"
          icon="pound"
        />
      ) : null}

      <TextField
        label="Reference"
        value={draft.reference}
        onChangeText={(reference) => patch({ reference })}
        placeholder="PO number, job name…"
        icon="link-variant"
      />

      {branches.length > 1 ? (
        <PickerField label="Branch" value={branch?.name} onPress={() => setBranchOpen(true)} icon="warehouse" />
      ) : null}

      {taxContext.regime === 'GST' ? (
        <PickerField
          label="Place of supply"
          value={INDIAN_STATES.find((s) => s.code === draft.placeOfSupplyStateCode)?.name}
          onPress={() => setPosOpen(true)}
          icon="map-marker-outline"
          hint={interState ? 'Inter-state supply — IGST applies.' : 'Intra-state supply — CGST + SGST apply.'}
        />
      ) : null}

      {/* Multi-currency is a full-plan module; a document already in another currency still shows it. */}
      {hasFx || draft.currency !== baseCurrency ? (
        <PickerField
          label="Currency"
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
          hint="The rate is stored on the document so it stays reproducible."
        />
      ) : null}
    </View>
  );

  const renderItems = () => (
    <View style={{ gap: t.spacing.md }}>
      <Button title="Add item" icon="plus" variant="secondary" onPress={() => setItemOpen(true)} fullWidth />

      {draft.lines.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="tag-outline"
            title="No lines yet"
            message="Add a product or service, or create a one-off line."
            actionLabel="Add item"
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
                    {line.taxInclusive ? <Badge label="Incl." tone="info" size="sm" /> : null}
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
        <Text variant="caption" tone="muted" weight="600">
          Discount on total
        </Text>
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
        label="Other charges"
        value={chargesText}
        onChangeValue={(v) => {
          setChargesText(v);
          patch({ charges: fromMajor(v || '0', draft.currency) });
        }}
        currency={draft.currency}
        hint="Freight, packing or installation added to the total."
      />

      <SwitchField
        label="Round off the total"
        description="Rounds the grand total to the nearest whole unit and shows the adjustment."
        value={draft.applyRoundOff}
        onValueChange={(applyRoundOff) => patch({ applyRoundOff })}
      />

      <TextField
        label="Notes"
        value={draft.notes}
        onChangeText={(notes) => patch({ notes })}
        placeholder="Visible to the customer on the document"
        multiline
      />

      <TextField
        label="Terms and conditions"
        value={draft.terms}
        onChangeText={(terms) => patch({ terms })}
        placeholder="Payment terms, warranty…"
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
              {label.singular} number
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
          ...(draft.validUntil ? [{ label: 'Valid until', value: draft.validUntil }] : []),
          { label: 'Branch', value: branch?.name ?? '—' },
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
        <Stepper steps={STEPS} current={step} />
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
            <Text variant="caption" tone="muted">
              Total
            </Text>
            <Text variant="title" weight="700">
              {formatMoney(totals.grandTotal)}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {step > 0 ? (
            <Button title="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button
              title="Continue"
              onPress={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              style={{ flex: 2 }}
            />
          ) : (
            <>
              <Button title="Save draft" variant="ghost" onPress={() => save(false)} style={{ flex: 1 }} />
              <Button title="Finalise" onPress={() => setConfirmFinalize(true)} style={{ flex: 1 }} />
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
        title="Add item"
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
              title="One-off line"
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
              title="New item"
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
        title="Document currency"
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={draft.currency}
        onSelect={(code) =>
          setCurrency(code, code === baseCurrency ? 1 : resolveRate(exchangeRates, code, baseCurrency, draft.date))
        }
      />

      <SelectSheet
        visible={posOpen}
        onClose={() => setPosOpen(false)}
        title="Place of supply"
        subtitle="Decides whether IGST or CGST + SGST applies"
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={draft.placeOfSupplyStateCode}
        onSelect={(placeOfSupplyStateCode) => patch({ placeOfSupplyStateCode })}
      />

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title="Branch"
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
        title={`Finalise this ${label.singular.toLowerCase()}?`}
        message={`A permanent number will be assigned and the ${label.singular.toLowerCase()} can no longer be edited freely.`}
        confirmLabel="Finalise"
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
