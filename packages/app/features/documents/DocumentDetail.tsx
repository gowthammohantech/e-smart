import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedLanguage } from '../../i18n/I18nProvider';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge, StatusBadge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { TotalsPanel } from '@esmart/ui/components/TotalsPanel';
import { Sheet } from '@esmart/ui/components/Sheet';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';

import { BusinessDocument, DocStatus, DocumentKind } from '@esmart/core/types';
import { STATUS_TONE, isFinalized, nextStatuses } from '@esmart/core/domain/documentStates';
import { documentKindLabel, statusLabel } from '@esmart/core/labels';
import { outstandingOf } from '@esmart/core/domain/receivables';
import { stockShortfalls } from '@esmart/core/domain/stockLedger';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { daysBetween, formatDate, today } from '@esmart/core/lib/date';
import { money } from '@esmart/core/lib/money';
import { INDIAN_STATES } from '@esmart/core/data/masters';
import { buildDocumentHtml } from '@esmart/core/render/documentHtml';

import { useAppStore } from '../../store/appStore';
import {
  useActiveCompany,
  useActiveEwayBill,
  useBaseCurrency,
  useBranches,
  useComplianceSettings,
  useParty,
  usePayments,
} from '../../store/selectors';
import { detailRouteFor } from './DocumentEditor';
import { ComplianceCard } from '../compliance/ComplianceCard';
import { EInvoiceSheet } from '../compliance/EInvoiceSheet';
import { canCancelEInvoice, isEInvoiceApplicable } from '@esmart/core/domain/eInvoice';
import { isEwayBillRequired } from '@esmart/core/domain/ewayBill';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { SplitPane } from '@esmart/ui/components/Layout';
import { Segmented } from '@esmart/ui/components/Field';
import { HtmlPreview, printHtml } from './HtmlPreview';

export function DocumentDetail({ document: doc }: { document: BusinessDocument }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common', 'domain', 'sales']);
  const language = useResolvedLanguage();
  const router = useRouter();
  const toast = useToast();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const branches = useBranches();
  const party = useParty(doc.partyId);
  const allPayments = usePayments();
  const ewayBill = useActiveEwayBill(doc.id);
  const complianceSettings = useComplianceSettings();
  const storeItems = useAppStore((s) => s.items);
  const stockMovements = useAppStore((s) => s.stockMovements);

  const setDocumentStatus = useAppStore((s) => s.setDocumentStatus);
  const removeDocument = useAppStore((s) => s.removeDocument);
  const duplicateDocument = useAppStore((s) => s.duplicateDocument);
  const convertDocument = useAppStore((s) => s.convertDocument);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [complianceSheet, setComplianceSheet] = useState<'generate' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = useIsDesktop();
  const [desktopTab, setDesktopTab] = useState<'details' | 'preview'>('details');

  const eInvoiceApplicable = useMemo(
    () =>
      isEInvoiceApplicable({
        document: doc,
        company,
        buyer: party,
        settings: complianceSettings,
        items: storeItems,
        now: new Date().toISOString(),
      }).applicable,
    [doc, company, party, complianceSettings, storeItems],
  );
  const ewayRequired = useMemo(
    () => isEwayBillRequired({ document: doc, items: storeItems, settings: complianceSettings }).required,
    [doc, storeItems, complianceSettings],
  );
  const canCancelIrn = canCancelEInvoice(doc.compliance, new Date().toISOString()).allowed;

  const kindName = documentKindLabel(tr, doc.kind, 1);
  const branch = branches.find((b) => b.id === doc.branchId);
  const isPayable = doc.kind === 'invoice' || doc.kind === 'purchaseBill';

  const relatedPayments = useMemo(
    () => allPayments.filter((p) => p.allocations.some((a) => a.documentId === doc.id)),
    [allPayments, doc.id],
  );

  const outstanding = useMemo(() => outstandingOf(doc, allPayments), [doc, allPayments]);
  const paid = money(doc.totals.grandTotal.minor - outstanding.minor, doc.currency);
  const overdueDays = doc.dueDate ? daysBetween(doc.dueDate, today()) : 0;

  const documentHtml = () =>
    buildDocumentHtml({
      t: tr,
      language,
      document: doc,
      company,
      party,
      branch,
      ewayBill,
    });

  const shareDocument = async () => {
    // A browser has no share sheet for files: its print dialog saves the PDF.
    if (Platform.OS === 'web') {
      printHtml(documentHtml()).catch(() => toast.show(tr('sales:print.printUnavailable'), 'error'));
      setActionsOpen(false);
      if (doc.kind === 'quote' && doc.status === 'draft') setDocumentStatus(doc.id, 'sent');
      return;
    }
    setBusy(true);
    try {
      const html = documentHtml();
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: tr('common:documentDetail.shareTitle', { kind: kindName, number: doc.number }),
        });
      } else {
        await Share.share({
          message: tr('common:documentDetail.shareMessage', {
            kind: kindName,
            number: doc.number,
            amount: formatMoney(doc.totals.grandTotal),
          }),
        });
      }
      if (doc.kind === 'quote' && doc.status === 'draft') setDocumentStatus(doc.id, 'sent');
    } catch {
      toast.show(tr('sales:detail.pdfFailed'), 'error');
    } finally {
      setBusy(false);
      setActionsOpen(false);
    }
  };

  const convert = (target: DocumentKind) => {
    const id = convertDocument(doc.id, target);
    setActionsOpen(false);
    if (id) {
      toast.show(
        tr('common:documentDetail.createdDraft', { kind: documentKindLabel(tr, target, 1) }),
        'success',
      );
      router.push(detailRouteFor(target, id) as never);
    }
  };

  const conversions: { target: DocumentKind; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] =
    doc.kind === 'quote'
      ? [
          { target: 'salesOrder', label: 'Convert to sales order', icon: 'clipboard-list-outline' },
          { target: 'invoice', label: 'Convert to invoice', icon: 'file-document-outline' },
        ]
      : doc.kind === 'salesOrder'
        ? [
            { target: 'delivery', label: 'Create delivery note', icon: 'truck-outline' },
            { target: 'invoice', label: 'Convert to invoice', icon: 'file-document-outline' },
          ]
        : doc.kind === 'delivery'
          ? [{ target: 'invoice', label: 'Convert to invoice', icon: 'file-document-outline' }]
          : doc.kind === 'invoice'
            ? [{ target: 'salesReturn', label: 'Create a return', icon: 'keyboard-return' }]
            : doc.kind === 'purchaseOrder'
              ? [
                  { target: 'goodsReceipt', label: 'Create goods receipt', icon: 'package-down' },
                  { target: 'purchaseBill', label: 'Convert to bill', icon: 'file-document-outline' },
                ]
              : doc.kind === 'goodsReceipt'
                ? [{ target: 'purchaseBill', label: 'Convert to bill', icon: 'file-document-outline' }]
                : doc.kind === 'purchaseBill'
                  ? [{ target: 'purchaseReturn', label: 'Create a return', icon: 'package-up' }]
                  : [];

  const transitions = nextStatuses(doc.kind, doc.status).filter((s) => s !== 'cancelled');

  const headerCard = (
    <>
      {/* Header */}
      <Card style={{ gap: t.spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 4, flex: 1 }}>
            <Text variant="caption" tone="muted">
              {kindName}
            </Text>
            <Text variant="h3" weight="700">
              {doc.number}
            </Text>
            <Text variant="caption" tone="muted">
              {formatDate(doc.date)}
              {branch ? ` · ${branch.name}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge status={doc.status} />
            {doc.status === 'overdue' && overdueDays > 0 ? (
              <Text variant="micro" tone="bad" weight="600">
                {overdueDays} days late
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: t.c.line }} />

        <Pressable
          onPress={() =>
            party &&
            router.push(
              party.kind === 'customer'
                ? `/(app)/contacts/customers/${party.id}`
                : `/(app)/contacts/suppliers/${party.id}`,
            )
          }
          accessibilityRole="button"
          accessibilityLabel={`Open ${party?.name ?? 'contact'}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
        >
          <Avatar name={party?.name ?? '?'} size={42} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body" weight="600">
              {party?.name ?? 'Unknown'}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {party?.taxId ?? party?.phone ?? party?.email ?? '—'}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
        </Pressable>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {doc.dueDate ? <Badge label={`Due ${formatDate(doc.dueDate, 'dd MMM')}`} tone={overdueDays > 0 ? 'danger' : 'neutral'} /> : null}
          {doc.validUntil ? <Badge label={`Valid to ${formatDate(doc.validUntil, 'dd MMM')}`} tone="neutral" /> : null}
          {doc.currency !== baseCurrency ? <Badge label={`${doc.currency} @ ${doc.exchangeRate.toFixed(2)}`} tone="info" /> : null}
          {doc.placeOfSupplyStateCode ? (
            <Badge label={`PoS ${INDIAN_STATES.find((s) => s.code === doc.placeOfSupplyStateCode)?.name ?? doc.placeOfSupplyStateCode}`} tone="neutral" />
          ) : null}
          {doc.reference ? <Badge label={`Ref ${doc.reference}`} tone="neutral" /> : null}
          {doc.supplierDocNumber ? <Badge label={`Their no. ${doc.supplierDocNumber}`} tone="neutral" /> : null}
        </View>
      </Card>
    </>
  );
  const paymentCard = (
    <>
      {/* Payment status */}
      {isPayable && isFinalized(doc.status) ? (
        <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ gap: 3 }}>
              <Text variant="caption" tone="muted">{tr('sales:detail.outstanding')}</Text>
              <Text variant="h3" weight="700" tone={outstanding.minor > 0 ? (overdueDays > 0 ? 'bad' : 'warn') : 'good'}>
                {formatMoney(outstanding)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text variant="caption" tone="muted">
                Paid
              </Text>
              <Text variant="title" weight="600" tone="good">
                {formatMoney(paid)}
              </Text>
            </View>
          </View>

          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.c.card2, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.min(100, (paid.minor / Math.max(1, doc.totals.grandTotal.minor)) * 100)}%`,
                height: '100%',
                backgroundColor: t.c.good,
              }}
            />
          </View>

          {outstanding.minor > 0 ? (
            <Button
              title={doc.kind === 'invoice' ? 'Record payment' : 'Pay supplier'}
              icon={doc.kind === 'invoice' ? 'cash-plus' : 'cash-minus'}
              onPress={() =>
                router.push(
                  `/(app)/payments/new?direction=${doc.kind === 'invoice' ? 'received' : 'paid'}&partyId=${doc.partyId}&documentId=${doc.id}`,
                )
              }
              fullWidth
            />
          ) : null}
        </Card>
      ) : null}
    </>
  );
  const linesSection = (
    <>
      {/* Lines */}
      <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('sales:detail.items')}</Text>
      <Card padded={false}>
        {doc.lines.map((line, i) => (
          <View
            key={line.id}
            style={{
              flexDirection: 'row',
              gap: t.spacing.md,
              padding: t.spacing.lg,
              borderBottomWidth: i < doc.lines.length - 1 ? 0.5 : 0,
              borderBottomColor: t.c.line,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="body" weight="600">
                {line.name}
              </Text>
              <Text variant="caption" tone="muted">
                {formatQty(line.quantity)} {line.unit} × {formatMoney(line.unitPrice)}
                {line.discountValue > 0
                  ? ` · −${line.discountMode === 'percent' ? formatPercent(line.discountValue) : formatMoney(money(line.discountValue * 100, doc.currency))}`
                  : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 2 }}>
                <Badge label={formatPercent(line.taxRate)} tone="neutral" size="sm" />
                {line.hsnCode ? <Badge label={`HSN ${line.hsnCode}`} tone="neutral" size="sm" /> : null}
              </View>
            </View>
            <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(money(Math.round(line.unitPrice.minor * line.quantity), doc.currency))}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
  const totalsCard = (
    <>
      {/* Totals */}
      <Card style={{ marginTop: t.spacing.md }}>
        <TotalsPanel
          totals={doc.totals}
          currency={doc.currency}
          baseCurrency={baseCurrency}
          exchangeRate={doc.exchangeRate}
        />
      </Card>
    </>
  );
  const paymentsSection = (
    <>
      {/* Payments */}
      {relatedPayments.length > 0 ? (
        <>
          <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('sales:detail.payments')}</Text>
          <Card padded={false}>
            {relatedPayments.map((p, i) => {
              const alloc = p.allocations.find((a) => a.documentId === doc.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/(app)/payments/${p.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Payment ${p.number}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < relatedPayments.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <MaterialCommunityIcons name="cash-check" size={20} color={t.c.good} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="600">
                      {p.number}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDate(p.date)} · {p.method}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </Text>
                  </View>
                  <Text variant="body" weight="700" tone="good">
                    {formatMoney(alloc?.amount ?? p.amount)}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}
    </>
  );
  const complianceSection = (
    <>
      {/* Compliance */}
      <ComplianceCard document={doc} />
    </>
  );
  const notesCard = (
    <>
      {/* Notes */}
      {doc.notes || doc.terms ? (
        <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
          {doc.notes ? (
            <View style={{ gap: 4 }}>
              <Text variant="caption" tone="muted" weight="600">{tr('sales:detail.notes')}</Text>
              <Text variant="small" style={{ lineHeight: 20 }}>
                {doc.notes}
              </Text>
            </View>
          ) : null}
          {doc.terms ? (
            <View style={{ gap: 4 }}>
              <Text variant="caption" tone="muted" weight="600">{tr('sales:detail.terms')}</Text>
              <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
                {doc.terms}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}
    </>
  );

  // A desktop lays the lines out as a table, with the actions in the page
  // header instead of a sticky footer.
  const desktopLines = (
    <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
      <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {tr('sales:detail.items')}
      </Text>
      <DataTable
        scroll={false}
        columns={[
          {
            key: 'item',
            header: tr('sales:detail.lineItem'),
            flex: 3,
            render: (line) => (
              <View style={{ gap: 2, maxWidth: '100%' }}>
                <Cell weight="600">{line.name}</Cell>
                {line.hsnCode ? <Cell tone="muted">{`HSN ${line.hsnCode}`}</Cell> : null}
              </View>
            ),
          },
          { key: 'qty', header: tr('sales:detail.qty'), width: 100, align: 'right', render: (line) => <Cell mono>{`${formatQty(line.quantity)} ${line.unit}`}</Cell> },
          { key: 'rate', header: tr('sales:detail.rate'), width: 130, align: 'right', render: (line) => <Cell mono>{formatMoney(line.unitPrice)}</Cell> },
          {
            key: 'discount',
            header: tr('sales:detail.discount'),
            width: 110,
            align: 'right',
            render: (line) => (
              <Cell tone="muted" mono>
                {line.discountValue > 0
                  ? line.discountMode === 'percent'
                    ? formatPercent(line.discountValue)
                    : formatMoney(money(line.discountValue * 100, doc.currency))
                  : '—'}
              </Cell>
            ),
          },
          { key: 'tax', header: tr('sales:detail.taxRate'), width: 80, align: 'right', render: (line) => <Cell tone="muted">{formatPercent(line.taxRate)}</Cell> },
          {
            key: 'amount',
            header: tr('sales:detail.lineAmount'),
            width: 140,
            align: 'right',
            render: (line) => (
              <Cell weight="700" mono>
                {formatMoney(money(Math.round(line.unitPrice.minor * line.quantity), doc.currency))}
              </Cell>
            ),
          },
        ]}
        rows={doc.lines}
        rowKey={(line) => line.id}
      />
    </View>
  );

  const desktopActions = (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      {!isFinalized(doc.status) ? (
        <Button
          title={tr('sales:detail.edit')}
          variant="ghost"
          icon="pencil-outline"
          onPress={() => router.push(`${detailRouteFor(doc.kind, doc.id)}/edit` as never)}
        />
      ) : null}
      <Button title={tr('sales:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} />
      {!isFinalized(doc.status) ? (
        <Button title={tr('sales:detail.finalise')} icon="check-decagram-outline" onPress={() => setStatusOpen(true)} />
      ) : (
        <Button title={tr('sales:print.savePdf')} icon="file-download-outline" onPress={shareDocument} loading={busy} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      {desktop ? (
        <>
          <Stack.Screen options={{ headerRight: () => desktopActions }} />
          <View style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md, flexDirection: 'row' }}>
            <View style={{ width: 240 }}>
              <Segmented
                size="sm"
                options={[
                  { value: 'details', label: tr('sales:detail.tabDetails') },
                  { value: 'preview', label: tr('sales:detail.tabPreview') },
                ]}
                value={desktopTab}
                onChange={(v) => setDesktopTab(v as 'details' | 'preview')}
              />
            </View>
          </View>
          {desktopTab === 'preview' ? (
            <View style={{ flex: 1, backgroundColor: t.c.canvas, borderRadius: t.radius.lg, marginHorizontal: t.spacing.lg, marginBottom: t.spacing.lg, padding: t.spacing.xl, alignItems: 'center' }}>
              <View style={[{ flex: 1, width: '100%', maxWidth: 860, borderRadius: t.radius.sm, overflow: 'hidden' }, t.shadow.card]}>
                <HtmlPreview html={documentHtml()} />
              </View>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
              showsVerticalScrollIndicator={SHOW_SCROLLBAR}
            >
              <SplitPane
                main={
                  <View style={{ gap: t.spacing.md }}>
                    {headerCard}
                    {desktopLines}
                    {totalsCard}
                    {notesCard}
                  </View>
                }
                side={
                  <>
                    {paymentCard}
                    {paymentsSection}
                    {complianceSection}
                  </>
                }
              />
            </ScrollView>
          )}
        </>
      ) : (
        <>
        <ScrollView
          contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        >
          {headerCard}
          {paymentCard}
          {linesSection}
          {totalsCard}
          {paymentsSection}
          {complianceSection}
          {notesCard}
        </ScrollView>

        {/* Sticky actions */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
            flexDirection: 'row',
            gap: t.spacing.md,
          }}
        >
          {!isFinalized(doc.status) ? (
            <Button
              title={tr('sales:detail.finalise')}
              icon="check-decagram-outline"
              onPress={() => setStatusOpen(true)}
              style={{ flex: 1 }}
            />
          ) : (
            <Button title={tr('sales:detail.share')} icon="share-variant" onPress={shareDocument} loading={busy} style={{ flex: 1 }} />
          )}
          <Button title={tr('sales:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} style={{ flex: 1 }} />
        </View>
        </>
      )}

      {/* Action sheet */}
      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={doc.number}>
        {[
          ...(isFinalized(doc.status)
            ? [{ label: 'Share as PDF', icon: 'file-pdf-box' as const, onPress: shareDocument }]
            : [{ label: 'Edit', icon: 'pencil-outline' as const, onPress: () => router.push(`${detailRouteFor(doc.kind, doc.id)}/edit` as never) }]),
          { label: 'Preview document', icon: 'eye-outline' as const, onPress: () => router.push(`/(app)/documents/${doc.id}`) },
          ...(eInvoiceApplicable && doc.compliance?.eInvoiceStatus !== 'generated' && doc.compliance?.eInvoiceStatus !== 'cancelled'
            ? [{ label: 'Generate e-invoice', icon: 'shield-check-outline' as const, onPress: () => { setActionsOpen(false); setComplianceSheet('generate'); } }]
            : []),
          ...(canCancelIrn
            ? [{ label: 'Cancel IRN', icon: 'shield-off-outline' as const, onPress: () => { setActionsOpen(false); setComplianceSheet('cancel'); } }]
            : []),
          ...(ewayBill
            ? [{ label: 'View e-way bill', icon: 'truck-fast-outline' as const, onPress: () => { setActionsOpen(false); router.push(`/(app)/compliance/eway/${ewayBill.id}`); } }]
            : ewayRequired
              ? [{ label: 'Generate e-way bill', icon: 'truck-fast-outline' as const, onPress: () => { setActionsOpen(false); router.push(`/(app)/compliance/eway/new?documentId=${doc.id}`); } }]
              : []),
          ...conversions.map((c) => ({ label: c.label, icon: c.icon, onPress: () => convert(c.target) })),
          { label: 'Duplicate', icon: 'content-duplicate' as const, onPress: () => {
            const id = duplicateDocument(doc.id);
            setActionsOpen(false);
            if (id) router.push(detailRouteFor(doc.kind, id) as never);
          } },
          ...(transitions.length ? [{ label: 'Change status', icon: 'swap-vertical' as const, onPress: () => { setActionsOpen(false); setStatusOpen(true); } }] : []),
          ...(doc.status !== 'cancelled' && isFinalized(doc.status)
            ? [{ label: tr('common:documentDetail.cancelKind', { kind: kindName }), icon: 'close-octagon-outline' as const, onPress: () => { setActionsOpen(false); setConfirmCancel(true); } }]
            : []),
          ...(!isFinalized(doc.status)
            ? [{ label: 'Delete draft', icon: 'trash-can-outline' as const, onPress: () => { setActionsOpen(false); setConfirmDelete(true); } }]
            : []),
        ].map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <MaterialCommunityIcons name={a.icon} size={20} color={t.c.text} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      {/* Status sheet */}
      <Sheet
        visible={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={tr('common:documentDetail.changeStatus')}
        subtitle={tr('common:documentDetail.currently', { status: statusLabel(tr, doc.status) })}
      >
        {transitions.length === 0 ? (
          <EmptyState icon="check-all" title={tr('sales:detail.nothingLeft')} message={tr('sales:detail.nothingLeftBody')} compact />
        ) : (
          transitions.map((s: DocStatus) => (
            <Pressable
              key={s}
              onPress={() => {
                // Finalising from here must pass the same stock check as the editor.
                const short = !isFinalized(doc.status) && isFinalized(s)
                  ? stockShortfalls({ doc, items: storeItems, movements: stockMovements, allowNegativeStock: company?.allowNegativeStock })
                  : [];
                if (short.length) {
                  toast.show(
                    tr('sales:editor.insufficientStock', {
                      names: short.map((x) => tr('sales:editor.stockShort', { name: x.name, onHand: x.onHand, needed: x.needed, unit: x.unit })).join(', '),
                    }),
                    'error',
                  );
                  return;
                }
                setDocumentStatus(doc.id, s);
                setStatusOpen(false);
                toast.show(tr('common:documentDetail.marked', { status: statusLabel(tr, s) }), 'success');
              }}
              accessibilityRole="button"
              accessibilityLabel={tr('common:documentDetail.markAs', { status: statusLabel(tr, s) })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: t.spacing.md,
                paddingHorizontal: t.spacing.lg,
                backgroundColor: pressed ? t.c.card2 : 'transparent',
              })}
            >
              <Badge label={statusLabel(tr, s)} tone={STATUS_TONE[s]} />
              <View style={{ flex: 1 }} />
              <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
            </Pressable>
          ))
        )}
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('sales:detail.deleteDraftTitle')}
        message={tr('sales:detail.deleteDraftMessage')}
        confirmLabel={tr('sales:detail.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeDocument(doc.id);
          setConfirmDelete(false);
          toast.show(tr('sales:detail.draftDeleted'), 'success');
          router.back();
        }}
      />

      <ConfirmDialog
        visible={confirmCancel}
        title={`Cancel ${doc.number}?`}
        message={tr('sales:detail.cancelMessage')}
        confirmLabel={tr('sales:detail.cancelDocument')}
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setDocumentStatus(doc.id, 'cancelled');
          setConfirmCancel(false);
          toast.show(tr('sales:detail.documentCancelled'), 'success');
        }}
      />

      {complianceSheet ? (
        <EInvoiceSheet
          visible
          onClose={() => setComplianceSheet(null)}
          document={doc}
          mode={complianceSheet}
        />
      ) : null}
    </View>
  );
}
