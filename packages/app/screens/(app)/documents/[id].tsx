import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedLanguage } from '../../../i18n/I18nProvider';
import { Platform, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import { buildDocumentHtml } from '@esmart/core/render/documentHtml';
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
import { deliverFile } from '../../../features/reports/exportFiles';
import { documentPdf, pdfFileName } from '../../../remote/documents';
import { describeError } from '../../../remote/errors';

export default function DocumentPreview() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'sales']);
  const language = useResolvedLanguage();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const company = useActiveCompany();
  const party = useParty(doc?.partyId);
  const branches = useBranches();
  const ewayBill = useActiveEwayBill(doc?.id);
  const [busy, setBusy] = useState(false);
  const desktop = useIsDesktop();

  const html = useMemo(
    () =>
      doc
        ? buildDocumentHtml({
            t: tr,
            language,
            document: doc,
            company,
            party,
            branch: branches.find((b) => b.id === doc.branchId),
            ewayBill,
          })
        : '',
    [doc, company, party, branches, ewayBill, tr, language],
  );

  if (!doc) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.preview') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} message={tr('common:notFound.document')} />
      </View>
    );
  }

  const label = documentKindLabel(tr, doc.kind, 1);

  /** The server's PDF, the same one the customer receives: downloaded in a browser, shared on a phone. */
  const share = async () => {
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

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ title: `${label} preview` }} />

      {desktop ? (
        // A desktop shows the page as a sheet of paper on the canvas.
        <View style={{ flex: 1, backgroundColor: t.c.canvas, padding: t.spacing.xl, alignItems: 'center' }}>
          <View style={[{ flex: 1, width: '100%', maxWidth: 860, borderRadius: t.radius.sm, overflow: 'hidden' }, t.shadow.card]}>
            <HtmlPreview html={html} />
          </View>
        </View>
      ) : (
        <HtmlPreview html={html} />
      )}

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
        <Button
          title={tr('sales:print.print')}
          variant="ghost"
          icon="printer-outline"
          onPress={() => printHtml(html).catch(() => toast.show(tr('sales:print.printUnavailable'), 'warning', { icon: 'printer-off-outline' }))}
          style={{ flex: 1 }}
        />
        <Button
          title={Platform.OS === 'web' ? tr('sales:print.savePdf') : tr('sales:print.sharePdf')}
          icon={Platform.OS === 'web' ? 'file-download-outline' : 'share-variant'}
          onPress={share}
          loading={busy}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
