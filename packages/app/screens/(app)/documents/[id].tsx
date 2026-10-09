import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedLanguage } from '../../../i18n/I18nProvider';
import { Platform, Share, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import { buildDocumentHtml } from '@esmart/core/render/documentHtml';
import { documentKindLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import {
  useActiveCompany,
  useActiveEwayBill,
  useBranches,
  useDocument,
  useParty,
} from '../../../store/selectors';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { HtmlPreview, printHtml } from '../../../features/documents/HtmlPreview';

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

  const share = async () => {
    // A browser has no share sheet for files: its print dialog saves the PDF.
    if (Platform.OS === 'web') {
      printHtml(html).catch(() => toast.show(tr('sales:print.printUnavailable'), 'error'));
      return;
    }
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${label} ${doc.number}` });
      } else {
        await Share.share({ message: `${label} ${doc.number} — ${formatMoney(doc.totals.grandTotal)}` });
      }
    } catch {
      toast.show(tr('sales:print.pdfFailed'), 'error');
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
          onPress={() => printHtml(html).catch(() => toast.show(tr('sales:print.printUnavailable'), 'error'))}
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
