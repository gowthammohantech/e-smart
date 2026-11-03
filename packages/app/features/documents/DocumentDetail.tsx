import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefreshOnFocus } from '../../remote/useRefreshOnFocus';
import { useResolvedLanguage } from '../../i18n/I18nProvider';
import { Linking, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge, StatusBadge } from '@esmart/ui/components/Badge';
import { knownToServer } from '../../remote/meta';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { TotalsPanel } from '@esmart/ui/components/TotalsPanel';
import { Sheet } from '@esmart/ui/components/Sheet';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast, type ToastIcon } from '@esmart/ui/components/Toast';
import { useServerSave } from '../../components/useServerSave';

import { BusinessDocument, DocStatus, DocumentKind } from '@esmart/core/types';
import { STATUS_TONE, conversionBlock, isFinalized, nextStatuses } from '@esmart/core/domain/documentStates';
import { documentKindLabel, paymentMethodLabel, statusLabel } from '@esmart/core/labels';
import { outstandingOf } from '@esmart/core/domain/receivables';
import { stockShortfalls } from '@esmart/core/domain/stockLedger';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { creditNoteDeadline, daysBetween, formatDate, today } from '@esmart/core/lib/date';
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
  useDocument,
  useParty,
  usePayments,
} from '../../store/selectors';
import { detailRouteFor, listRouteFor } from './DocumentEditor';
import { ComplianceCard } from '../compliance/ComplianceCard';
import { EInvoiceSheet } from '../compliance/EInvoiceSheet';
import { canCancelEInvoice, isEInvoiceApplicable } from '@esmart/core/domain/eInvoice';
import { ewayBillStatusAt, isEwayBillRequired } from '@esmart/core/domain/ewayBill';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';
import { SplitPane } from '@esmart/ui/components/Layout';
import { Segmented } from '@esmart/ui/components/Field';
import { HtmlPreview } from './HtmlPreview';
import { deliverFile } from '../reports/exportFiles';
import { documentPdf, paymentLink, pdfFileName, pdfLink, sendDocument, shareLink, type SendChannel } from '../../remote/documents';
import { describeError } from '../../remote/errors';
import { useGoBack } from '../../navigation/useGoBack';

export function DocumentDetail({ document: doc }: { document: BusinessDocument }) {
  useRefreshOnFocus();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common', 'domain', 'sales', 'compliance']);
  const language = useResolvedLanguage();
  const router = useRouter();
  const goBack = useGoBack();
  const toast = useToast();
  const { run: serverSave } = useServerSave();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const branches = useBranches();
  const party = useParty(doc.partyId);
  // The order, receipt or invoice this one was made from, e.g. the PO behind a goods receipt.
  const sourceDoc = useDocument(doc.sourceDocumentId);
  const allPayments = usePayments();
  const ewayBill = useActiveEwayBill(doc.id);
  const complianceSettings = useComplianceSettings();
  const storeItems = useAppStore((s) => s.items);
  const stockMovements = useAppStore((s) => s.stockMovements);

  const setDocumentStatus = useAppStore((s) => s.setDocumentStatus);
  const removeDocument = useAppStore((s) => s.removeDocument);
  const duplicateDocument = useAppStore((s) => s.duplicateDocument);
  const convertDocument = useAppStore((s) => s.convertDocument);
  const allDocuments = useAppStore((s) => s.documents);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
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

  /** The server's PDF: downloaded in a browser, handed to the share sheet on a phone. */
  const shareDocument = async () => {
    setBusy(true);
    try {
      await toast.promise(
        (async () => {
          const bytes = await documentPdf(doc.companyId, doc.id, language === 'ta' ? 'ta' : 'en');
          await deliverFile(pdfFileName(doc.kind, doc.number), bytes, 'application/pdf');
        })(),
        {
          loading: tr('sales:detail.pdfPreparing'),
          success: { text: tr(Platform.OS === 'web' ? 'sales:detail.pdfDownloaded' : 'sales:detail.pdfReady'), detail: pdfFileName(doc.kind, doc.number) },
          error: (err) => `${tr('sales:detail.pdfFailed')} ${describeError(err, tr)}`,
          icon: 'file-pdf-box',
        },
      );
      if (doc.kind === 'quote' && doc.status === 'draft') setDocumentStatus(doc.id, 'sent');
    } catch {
      // The toast has said what went wrong.
    } finally {
      setBusy(false);
      setActionsOpen(false);
    }
  };

  /** A link copied in a browser, or offered to the share sheet on a phone. */
  const handOverLink = async (url: string) => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(url);
      return;
    }
    await Share.share({
      message: tr('common:documentDetail.shareMessage', { kind: kindName, number: doc.number, amount: formatMoney(doc.totals.grandTotal) }) + `\n${url}`,
    });
  };

  // What a toast is about: the document and who it went to.
  const about = [doc.number, party?.name].filter(Boolean).join(' · ');

  /** A server round trip under a promise toast: working while it is out, then done or why not. */
  const runRemote = (job: () => Promise<void>, messages: { loading: string; success: string; icon: ToastIcon }) => {
    setBusy(true);
    toast
      .promise(job(), { ...messages, success: { text: messages.success, detail: about }, error: (err) => describeError(err, tr) })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const send = (channel: SendChannel) =>
    runRemote(
      () => sendDocument(doc.companyId, doc.id, channel, { includePaymentLink: isPayable && doc.kind === 'invoice' && outstanding.minor > 0 }),
      { loading: tr('sales:detail.sending'), success: tr('common:documentDetail.sent'), icon: channel === 'whatsapp' ? 'whatsapp' : 'email-fast-outline' },
    );

  /**
   * Email / WhatsApp for a party with no address on file (and WhatsApp in a
   * browser): the person's own mail app or WhatsApp opens with the document's
   * details and link filled in.
   */
  const compose = (channel: 'email' | 'whatsapp') =>
    runRemote(async () => {
      const url = await shareLink(doc.companyId, doc.id);
      const text = `${tr('common:documentDetail.shareMessage', { kind: kindName, number: doc.number, amount: formatMoney(doc.totals.grandTotal) })}
${url}`;
      const target =
        channel === 'whatsapp'
          ? `https://wa.me/${(party?.phone ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`
          : `mailto:${party?.email ?? ''}?subject=${encodeURIComponent(`${kindName} ${doc.number}`)}&body=${encodeURIComponent(text)}`;
      await Linking.openURL(target);
    }, {
      loading: tr('sales:detail.preparingMessage'),
      success: tr(channel === 'whatsapp' ? 'sales:detail.openedWhatsapp' : 'sales:detail.openedEmail'),
      icon: channel === 'whatsapp' ? 'whatsapp' : 'email-edit-outline',
    });

  const sendVia = (channel: 'email' | 'whatsapp') => {
    const hasContact = channel === 'email' ? !!party?.email : !!party?.phone;
    // Email goes from the server wherever it is sent from, so the customer gets the designed
    // email with the PDF and payment links; a browser opening a mail app could only send text.
    if (!hasContact || (Platform.OS === 'web' && channel === 'whatsapp')) compose(channel);
    else send(channel);
  };

  const convert = async (target: DocumentKind) => {
    setActionsOpen(false);
    const res = await serverSave(() => convertDocument(doc.id, target), tr('common:documentDetail.createdDraft', { kind: documentKindLabel(tr, target, 1) }), {
      icon: 'file-replace-outline',
      detail: tr('sales:detail.fromDocument', { number: doc.number }),
    });
    if (res?.result) router.push(detailRouteFor(target, res.id ?? res.result) as never);
  };

  const offered: { target: DocumentKind; label: string; icon: IconName }[] =
    doc.kind === 'quote'
      ? [
          { target: 'salesOrder', label: tr('sales:detail.convertToSalesOrder'), icon: 'clipboard-list-outline' },
          { target: 'invoice', label: tr('sales:detail.convertToInvoice'), icon: 'file-document-outline' },
        ]
      : doc.kind === 'salesOrder'
        ? [
            { target: 'delivery', label: tr('sales:detail.createDelivery'), icon: 'truck-outline' },
            { target: 'invoice', label: tr('sales:detail.convertToInvoice'), icon: 'file-document-outline' },
          ]
        : doc.kind === 'delivery'
          ? [{ target: 'invoice', label: tr('sales:detail.convertToInvoice'), icon: 'file-document-outline' }]
          : doc.kind === 'invoice'
            ? [{ target: 'salesReturn', label: tr('sales:detail.createReturn'), icon: 'keyboard-return' }]
            : doc.kind === 'purchaseOrder'
              ? [
                  { target: 'goodsReceipt', label: tr('sales:detail.createGoodsReceipt'), icon: 'package-down' },
                  { target: 'purchaseBill', label: tr('sales:detail.convertToBill'), icon: 'file-document-outline' },
                ]
              : doc.kind === 'goodsReceipt'
                ? [{ target: 'purchaseBill', label: tr('sales:detail.convertToBill'), icon: 'file-document-outline' }]
                : doc.kind === 'purchaseBill'
                  ? [{ target: 'purchaseReturn', label: tr('sales:detail.createReturn'), icon: 'package-up' }]
                  : [];
  // Only what can be made now: nothing from a draft or a cancelled document,
  // and an order or quote carried forward once (conversionBlock).
  const conversions = offered.filter((c) => !conversionBlock(doc, c.target, allDocuments));

  const transitions = nextStatuses(doc.kind, doc.status).filter((s) => s !== 'cancelled');
  // What Finalise moves a draft to (issued, received, sent…), as the editor's Finalise does.
  const finaliseTo = isFinalized(doc.status) ? undefined : transitions.find(isFinalized);

  const markAs = (s: DocStatus, message = tr('common:documentDetail.marked', { status: statusLabel(tr, s) })) => {
    // Finalising from here must pass the same stock check as the editor.
    const short = !isFinalized(doc.status) && isFinalized(s)
      ? stockShortfalls({ doc, items: storeItems, movements: stockMovements, allowNegativeStock: company?.allowNegativeStock })
      : [];
    if (short.length) {
      toast.show(
        tr('sales:editor.insufficientStock', {
          date: formatDate(doc.date),
          names: short.map((x) => tr('sales:editor.stockShort', { name: x.name, onHand: x.onHand, needed: x.needed, unit: x.unit })).join(', '),
        }),
        'warning',
        { icon: 'package-variant-closed-remove' },
      );
      return;
    }
    setStatusOpen(false);
    void serverSave(() => setDocumentStatus(doc.id, s), message, { icon: 'flag-checkered', detail: doc.number, varies: true });
  };

  // Finalise asks once, then finalises; the status list is for anything else.
  const finalise = () => (finaliseTo ? setConfirmFinalize(true) : setStatusOpen(true));

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
            {sourceDoc ? (
              <Pressable
                onPress={() => router.push(detailRouteFor(sourceDoc.kind, sourceDoc.id) as never)}
                accessibilityRole="link"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2 }}
              >
                <Icon name="link-variant" size={14} color={t.c.primary} />
                <Text variant="caption" tone="primary" weight="600">
                  {tr('sales:detail.against', { kind: documentKindLabel(tr, sourceDoc.kind, 1), number: sourceDoc.number })}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge status={doc.status} />
            {doc.kind === 'salesReturn' && sourceDoc && doc.date > creditNoteDeadline(sourceDoc.date) ? <Badge label={tr('common:component.pastCreditNoteDeadline')} tone="warning" size="sm" /> : null}
            {doc.status !== 'draft' && !knownToServer(doc.id) ? <Badge label={tr('common:component.provisional')} tone="warning" size="sm" /> : null}
            {doc.status === 'overdue' && overdueDays > 0 ? (
              <Text variant="micro" tone="bad" weight="600">
                {tr('sales:detail.daysLate', { count: overdueDays })}
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
          accessibilityLabel={party ? tr('sales:detail.openParty', { name: party.name }) : tr('sales:detail.openContact')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
        >
          <Avatar name={party?.name ?? '?'} size={42} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body" weight="600">
              {party?.name ?? tr('common:placeholder.unknown')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {party?.taxId ?? party?.phone ?? party?.email ?? '—'}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={t.c.muted} />
        </Pressable>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {doc.dueDate ? <Badge label={tr('sales:detail.dueOn', { date: formatDate(doc.dueDate, 'dd MMM') })} tone={overdueDays > 0 ? 'danger' : 'neutral'} /> : null}
          {doc.validUntil ? <Badge label={tr('sales:detail.validTo', { date: formatDate(doc.validUntil, 'dd MMM') })} tone="neutral" /> : null}
          {doc.currency !== baseCurrency ? <Badge label={`${doc.currency} @ ${doc.exchangeRate.toFixed(2)}`} tone="info" /> : null}
          {doc.placeOfSupplyStateCode ? (
            <Badge label={tr('sales:detail.placeOfSupplyBadge', { state: INDIAN_STATES.find((s) => s.code === doc.placeOfSupplyStateCode)?.name ?? doc.placeOfSupplyStateCode })} tone="neutral" />
          ) : null}
          {doc.reference ? <Badge label={tr('sales:detail.referenceBadge', { reference: doc.reference })} tone="neutral" /> : null}
          {doc.supplierDocNumber ? <Badge label={tr('sales:detail.theirNumber', { number: doc.supplierDocNumber })} tone="neutral" /> : null}
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
                {tr('sales:detail.paid')}
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
              title={doc.kind === 'invoice' ? tr('common:action.recordPayment') : tr('sales:detail.paySupplier')}
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
                  accessibilityLabel={tr('sales:detail.paymentNumber', { number: p.number })}
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
                  <Icon name="cash-check" size={20} color={t.c.good} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="600">
                      {p.number}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDate(p.date)} · {paymentMethodLabel(tr, p.method)}
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
        pageSize={TABLE_PAGE_SIZE}
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
        <Button title={tr('sales:detail.finalise')} icon="check-decagram-outline" onPress={finalise} />
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
              onPress={finalise}
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
            ? [
                { label: tr('sales:print.sharePdf'), icon: 'file-pdf-box' as const, onPress: shareDocument },
                { label: tr('sales:detail.sendEmail'), icon: 'email-outline' as const, onPress: () => sendVia('email') },
                { label: tr('sales:detail.sendWhatsapp'), icon: 'whatsapp' as const, onPress: () => sendVia('whatsapp') },
                { label: Platform.OS === 'web' ? tr('sales:detail.copyLink') : tr('sales:detail.shareLink'), icon: 'link-variant' as const, onPress: () =>
                    runRemote(async () => handOverLink(await pdfLink(doc.companyId, doc.id)), {
                      loading: tr('sales:detail.creatingLink'),
                      success: tr(Platform.OS === 'web' ? 'common:documentDetail.linkCopied' : 'sales:detail.linkReady'),
                      icon: 'link-variant',
                    }) },
                ...(doc.kind === 'invoice' && outstanding.minor > 0
                  ? [{ label: tr('sales:detail.paymentLink'), icon: 'credit-card-outline' as const, onPress: () =>
                          runRemote(async () => handOverLink((await paymentLink(doc.companyId, doc.id)).url), {
                            loading: tr('sales:detail.creatingLink'),
                            success: tr(Platform.OS === 'web' ? 'common:documentDetail.linkCopied' : 'sales:detail.linkReady'),
                            icon: 'credit-card-outline',
                          }) }]
                  : []),
              ]
            : [{ label: tr('sales:detail.edit'), icon: 'pencil-outline' as const, onPress: () => router.push(`${detailRouteFor(doc.kind, doc.id)}/edit` as never) }]),
          {
            label: doc.kind === 'purchaseBill' ? tr('sales:detail.paySupplier') : tr('common:action.recordPayment'),
            icon: 'cash-plus' as const,
            onPress: () => {
              if (!isPayable) return toast.show(tr('common:documentDetail.noPayment', { kind: kindName }), 'warning');
              if (!isFinalized(doc.status)) return toast.show(tr('common:documentDetail.issueFirst'), 'warning');
              if (outstanding.minor <= 0) return toast.show(tr('common:documentDetail.nothingDue'), 'info', { icon: 'check-decagram-outline', detail: doc.number });
              router.push(
                `/(app)/payments/new?direction=${doc.kind === 'invoice' ? 'received' : 'paid'}&partyId=${doc.partyId}&documentId=${doc.id}` as never,
              );
            },
          },
          { label: tr('sales:detail.previewDocument'), icon: 'eye-outline' as const, onPress: () => router.push(`/(app)/documents/${doc.id}`) },
          ...(eInvoiceApplicable && doc.compliance?.eInvoiceStatus !== 'generated' && doc.compliance?.eInvoiceStatus !== 'cancelled'
            ? [{ label: tr('sales:detail.generateEInvoice'), icon: 'shield-check-outline' as const, onPress: () => { setActionsOpen(false); setComplianceSheet('generate'); } }]
            : []),
          ...(canCancelIrn
            ? [{ label: tr('compliance:einv.cancelIrnShort'), icon: 'shield-off-outline' as const, onPress: () => { setActionsOpen(false); setComplianceSheet('cancel'); } }]
            : []),
          ...(ewayBill
            ? [{ label: tr('sales:detail.viewEwayBill'), icon: 'truck-fast-outline' as const, onPress: () => { setActionsOpen(false); router.push(`/(app)/compliance/eway/${ewayBill.id}`); } }]
            : ewayRequired
              ? [{ label: tr('compliance:ewb.generate'), icon: 'truck-fast-outline' as const, onPress: () => { setActionsOpen(false); router.push(`/(app)/compliance/eway/new?documentId=${doc.id}`); } }]
              : []),
          ...conversions.map((c) => ({ label: c.label, icon: c.icon, onPress: () => void convert(c.target) })),
          { label: tr('sales:detail.duplicate'), icon: 'content-duplicate' as const, onPress: () => {
            setActionsOpen(false);
            void serverSave(() => duplicateDocument(doc.id)).then((res) => {
              if (res?.result) router.push(detailRouteFor(doc.kind, res.id ?? res.result) as never);
            });
          } },
          ...(transitions.length ? [{ label: tr('common:documentDetail.changeStatus'), icon: 'swap-vertical' as const, onPress: () => { setActionsOpen(false); setStatusOpen(true); } }] : []),
          ...(doc.status !== 'cancelled' && isFinalized(doc.status)
            ? [{ label: tr('common:documentDetail.cancelKind', { kind: kindName }), icon: 'close-octagon-outline' as const, onPress: () => {
                setActionsOpen(false);
                // The server refuses while the e-way bill or the IRN is live (in that
                // order), so say so before the user confirms.
                if (ewayBill && ewayBillStatusAt(ewayBill, new Date().toISOString()) === 'active') {
                  toast.show(tr('sales:detail.cancelEwayFirst', { number: ewayBill.ewayBillNumber }), 'warning', { icon: 'truck-alert-outline' });
                  return;
                }
                if (doc.compliance?.eInvoiceStatus === 'generated') {
                  toast.show(tr('sales:detail.cancelIrnFirst'), 'warning', { icon: 'file-alert-outline' });
                  return;
                }
                setConfirmCancel(true);
              } }]
            : []),
          ...(!isFinalized(doc.status)
            ? [{ label: tr('sales:detail.deleteDraft'), icon: 'trash-can-outline' as const, onPress: () => { setActionsOpen(false); setConfirmDelete(true); } }]
            : []),
        ].map((a) => (
          <Pressable
            key={a.label}
            // Every action closes the sheet first; it is a modal, so one left open
            // would sit over the screen the action navigates to.
            onPress={() => {
              setActionsOpen(false);
              a.onPress();
            }}
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
            <Icon name={a.icon} size={20} color={t.c.text} />
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
              onPress={() => markAs(s)}
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
              <Icon name="chevron-right" size={18} color={t.c.muted} />
            </Pressable>
          ))
        )}
      </Sheet>

      <ConfirmDialog
        visible={confirmFinalize}
        title={tr('common:documentEditor.finaliseTitle', { kind: kindName })}
        message={tr('common:documentEditor.finaliseMessage', { kind: kindName })}
        confirmLabel={tr('sales:detail.finalise')}
        icon="check-decagram-outline"
        onCancel={() => setConfirmFinalize(false)}
        onConfirm={() => {
          setConfirmFinalize(false);
          if (finaliseTo) markAs(finaliseTo, tr('common:documentEditor.finalised', { kind: kindName }));
        }}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('sales:detail.deleteDraftTitle')}
        message={tr('sales:detail.deleteDraftMessage')}
        confirmLabel={tr('sales:detail.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void serverSave(() => removeDocument(doc.id), tr('sales:detail.draftDeleted'), { icon: 'delete-outline', detail: doc.number }).then((res) => {
            if (res) goBack(listRouteFor(doc.kind));
          });
        }}
      />

      <ConfirmDialog
        visible={confirmCancel}
        title={tr('sales:detail.cancelTitle', { number: doc.number })}
        message={tr('sales:detail.cancelMessage')}
        confirmLabel={tr('sales:detail.cancelDocument')}
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          void serverSave(() => setDocumentStatus(doc.id, 'cancelled'), tr('sales:detail.documentCancelled'), { icon: 'close-octagon-outline', detail: doc.number });
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
