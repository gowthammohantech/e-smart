import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedLanguage } from '../../../i18n/I18nProvider';
import { Platform, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { PickerField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import { buildDocumentHtml, buildEInvoiceHtml } from '@esmart/core/render/documentHtml';
import { buildEwayBillHtml } from '@esmart/core/render/ewayBillHtml';
import { hasIrn } from '@esmart/core/render/docView';
import { NOTE_SOURCE } from '@esmart/core/domain/documentStates';
import { INVOICE_LAYOUTS, isInvoiceLayout, resolveTemplate, type InvoiceLayout } from '@esmart/core/render/invoiceTemplate';
import { documentKindLabel } from '@esmart/core/labels';
import {
  useActiveCompany,
  useActiveEwayBill,
  useBranches,
  useDocument,
  useParty,
} from '../../../store/selectors';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { HtmlPreview, printHtml } from '../../../features/documents/HtmlPreview';
import { deliverFile, deliverPdf } from '../../../features/reports/exportFiles';
import { documentPdf, pdfFileName, type PrintCopy } from '../../../remote/documents';
import { api } from '../../../remote/api';
import { applyEntity } from '../../../remote/apply';
import { LayoutThumb } from '../../../features/documents/LayoutThumb';
import { describeError } from '../../../remote/errors';
import { useDocumentRecord } from '../../../remote/queries';
import { useLogoSrc } from '../../../remote/logoSrc';
import { LoadingView } from '../../../components/LoadingView';
import { useAppStore } from '../../../store/appStore';

/** What the preview prints: the document itself, or its e-invoice or e-way bill. */
type PrintFormat = 'document' | 'eInvoice' | 'ewayBill';

/** The sheet of paper's width on a desktop; the template and copy pickers above it share the same width. */
const PAPER_WIDTH = 860;

export default function DocumentPreview() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'compliance', 'domain', 'nav', 'sales', 'settings']);
  const language = useResolvedLanguage();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const remote = useDocumentRecord(id);
  const company = useActiveCompany();
  const sourceId = doc?.sourceDocumentId;
  // A note prints the invoice or bill it is against, an invoice the order or challan it came from:
  // fetched too, in case the device doesn't hold it.
  useDocumentRecord(sourceId);
  const source = useDocument(sourceId);
  const against = !!doc && !!NOTE_SOURCE[doc.kind];
  const party = useParty(doc?.partyId);
  const branches = useBranches();
  const ewayBill = useActiveEwayBill(doc?.id);
  const [busy, setBusy] = useState(false);
  const desktop = useIsDesktop();
  const [copy, setCopy] = useState<PrintCopy>('original');
  const [picking, setPicking] = useState<'layout' | 'copy' | 'format' | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  // What the page is: the document, or (once it has them) its e-invoice or e-way bill.
  const [format, setFormat] = useState<PrintFormat>('document');
  const formats: PrintFormat[] = ['document', ...(doc && hasIrn(doc) ? ['eInvoice' as const] : []), ...(ewayBill ? ['ewayBill' as const] : [])];
  const shownFormat = formats.includes(format) ? format : 'document';

  const customFields = useAppStore((s) => s.customFields);
  const logoSrc = useLogoSrc(company);
  const html = useMemo(() => {
    if (!doc) return '';
    if (shownFormat === 'ewayBill' && ewayBill) return buildEwayBillHtml({ bill: ewayBill, document: doc });
    return (shownFormat === 'eInvoice' ? buildEInvoiceHtml : buildDocumentHtml)({
            t: tr,
            language,
            document: doc,
            company,
            logoSrc,
            party,
            branch: branches.find((b) => b.id === doc.branchId),
            ewayBill,
            source: against ? source : undefined,
            origin: !against && source ? { number: source.number, date: source.date, kind: source.kind } : undefined,
            customFields,
            copy,
          });
  }, [doc, company, logoSrc, party, branches, ewayBill, source, against, customFields, copy, tr, language, shownFormat]);

  if (!doc && remote.isLoading) return <LoadingView variant="page" title={tr('nav:title.preview')} />;
  if (!doc) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.preview') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} message={tr('common:notFound.document')} />
      </View>
    );
  }

  const label = documentKindLabel(tr, doc.kind, 1);
  const layoutName = (l: InvoiceLayout) => tr(`settings:invoiceDesign.layouts.${l}.name`);
  const companyLayout = resolveTemplate(company.invoiceTemplate).layout;
  const shownLayout = doc.printLayout ?? companyLayout;
  const COPIES: PrintCopy[] = ['original', 'duplicate', 'triplicate', 'all'];
  const formatName = (f: PrintFormat) => (f === 'eInvoice' ? tr('compliance:einv.eInvoice') : f === 'ewayBill' ? tr('compliance:einv.ewayBill') : label);

  /** This document's own template: saved on the server, so its PDF, link and emails follow. */
  const chooseLayout = async (value: string) => {
    setPicking(null);
    const layout = isInvoiceLayout(value) ? value : null;
    if (layout === (doc.printLayout ?? null)) return;
    setSavingLayout(true);
    try {
      const { data, error } = await api.PUT('/companies/{companyId}/documents/{id}/print-layout', {
        params: { path: { companyId: doc.companyId, id: doc.id } },
        body: { layout },
      });
      if (error || !data) throw error ?? new Error('No answer from the server');
      applyEntity('document', data);
      toast.show(tr('sales:print.layoutSaved', { kind: label.toLowerCase(), name: layoutName(layout ?? companyLayout) }), 'success', { icon: 'file-document-outline', detail: doc.number });
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setSavingLayout(false);
    }
  };

  /** The server's PDF, the same one the customer receives: downloaded in a browser, shared on a phone. */
  const share = async () => {
    setBusy(true);
    // The e-invoice and e-way bill are this page itself, made into a PDF here.
    if (shownFormat !== 'document') {
      const name = shownFormat === 'ewayBill' && ewayBill ? `e-way-bill-${ewayBill.ewayBillNumber}.pdf` : pdfFileName(doc.kind, doc.number).replace(/\.pdf$/, '-e-invoice.pdf');
      await deliverPdf(name, html)
        .catch(() => toast.show(tr('sales:print.printUnavailable'), 'warning', { icon: 'printer-off-outline' }))
        .finally(() => setBusy(false));
      return;
    }
    try {
      await toast.promise(
        (async () => {
          const bytes = await documentPdf(doc.companyId, doc.id, language === 'ta' ? 'ta' : 'en', copy);
          await deliverFile(pdfFileName(doc.kind, doc.number), bytes, 'application/pdf');
        })(),
        {
          loading: tr('sales:detail.pdfPreparing'),
          success: { text: tr(Platform.OS === 'web' ? 'sales:detail.pdfDownloaded' : 'sales:detail.pdfReady'), detail: pdfFileName(doc.kind, doc.number) },
          error: (err) => `${tr('sales:print.pdfFailed')} ${describeError(err, tr)}`,
          icon: 'file-pdf-box',
        },
      );
    } catch {
      // The toast has said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  const print = () => printHtml(html).catch(() => toast.show(tr('sales:print.printUnavailable'), 'warning', { icon: 'printer-off-outline' }));
  const pdfTitle = Platform.OS === 'web' ? tr('sales:print.savePdf') : tr('sales:print.sharePdf');
  const pdfIcon = Platform.OS === 'web' ? 'file-download-outline' : 'share-variant';

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen
        options={{
          title: tr('nav:title.documentPreview', { kind: label }),
          // A desktop prints and saves from the header, not a bar across the foot of the page.
          ...(desktop
            ? {
                headerRight: () => (
                  <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                    <Button title={tr('sales:print.print')} variant="ghost" icon="printer-outline" onPress={print} />
                    <Button title={pdfTitle} icon={pdfIcon} onPress={share} loading={busy} />
                  </View>
                ),
              }
            : null),
        }}
      />

      {/* How this one prints: its template (saved on it) and which copy (only for this print). */}
      <View
        style={{
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.sm,
          backgroundColor: t.c.paper,
          borderBottomWidth: 1,
          borderBottomColor: t.c.line,
        }}
      >
        <View style={[{ flexDirection: 'row', gap: t.spacing.md }, desktop ? { width: '100%', maxWidth: PAPER_WIDTH, alignSelf: 'center' } : null]}>
          {formats.length > 1 ? (
            <PickerField label={tr('sales:print.printAs')} value={formatName(shownFormat)} icon="file-swap-outline" onPress={() => setPicking('format')} containerStyle={{ flex: 1 }} />
          ) : null}
          {/* The e-way bill has the portal's one layout and copy. */}
          {shownFormat === 'ewayBill' ? null : (
            <>
              <PickerField
                label={tr('sales:print.template')}
                value={layoutName(shownLayout)}
                icon="file-document-edit-outline"
                onPress={() => setPicking('layout')}
                disabled={savingLayout}
                containerStyle={{ flex: 1 }}
              />
              <PickerField label={tr('sales:print.copy')} value={tr(`sales:print.copies.${copy}`)} icon="content-copy" onPress={() => setPicking('copy')} containerStyle={{ flex: 1 }} />
            </>
          )}
        </View>
      </View>
      <SelectSheet
        visible={picking === 'layout'}
        onClose={() => setPicking(null)}
        title={tr('sales:print.template')}
        subtitle={doc.number}
        searchable={false}
        value={doc.printLayout ?? 'default'}
        onSelect={(v) => void chooseLayout(v)}
        options={[
          { value: 'default', label: tr('sales:print.businessDefaultIs', { name: layoutName(companyLayout) }), icon: 'domain' },
          ...INVOICE_LAYOUTS.map((l) => ({
            value: l,
            label: layoutName(l),
            description: tr(`settings:invoiceDesign.layouts.${l}.description`),
            leading: <LayoutThumb layout={l} accent={resolveTemplate(company.invoiceTemplate, l).accentColor} width={30} />,
          })),
        ]}
      />
      <SelectSheet
        visible={picking === 'format'}
        onClose={() => setPicking(null)}
        title={tr('sales:print.printAs')}
        subtitle={doc.number}
        searchable={false}
        value={shownFormat}
        onSelect={(v) => {
          setFormat(v as PrintFormat);
          setPicking(null);
        }}
        options={formats.map((f) => ({ value: f, label: formatName(f), icon: f === 'ewayBill' ? 'truck-outline' : f === 'eInvoice' ? 'qrcode' : 'file-document-outline' }))}
      />
      <SelectSheet
        visible={picking === 'copy'}
        onClose={() => setPicking(null)}
        title={tr('sales:print.copy')}
        searchable={false}
        value={copy}
        onSelect={(v) => {
          setCopy(v as PrintCopy);
          setPicking(null);
        }}
        options={COPIES.map((c) => ({ value: c, label: tr(`sales:print.copies.${c}`), icon: c === 'all' ? 'content-copy' : 'file-outline' }))}
      />

      {desktop ? (
        // A desktop shows the page as a sheet of paper on the canvas.
        <View style={{ flex: 1, backgroundColor: t.c.canvas, padding: t.spacing.xl, alignItems: 'center' }}>
          <View style={[{ flex: 1, width: '100%', maxWidth: PAPER_WIDTH, borderRadius: t.radius.sm, overflow: 'hidden' }, t.shadow.card]}>
            <HtmlPreview html={html} />
          </View>
        </View>
      ) : (
        <HtmlPreview html={html} />
      )}

      {/* A desktop has these in the page header instead. */}
      {desktop ? null : (
        <View
          style={{
            padding: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
            flexDirection: 'row',
            gap: t.spacing.md,
          }}
        >
          <Button title={tr('sales:print.print')} variant="ghost" icon="printer-outline" onPress={print} style={{ flex: 1 }} />
          <Button title={pdfTitle} icon={pdfIcon} onPress={share} loading={busy} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}
