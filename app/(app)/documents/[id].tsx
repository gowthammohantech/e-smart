import React, { useMemo, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { buildDocumentHtml } from '@/features/documents/documentHtml';
import { DOCUMENT_LABELS } from '@/domain/documentStates';
import { formatMoney } from '@/lib/format';
import {
  useActiveCompany,
  useActiveEwayBill,
  useBranches,
  useDocument,
  useParty,
} from '@/store/selectors';

export default function DocumentPreview() {
  const t = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const company = useActiveCompany();
  const party = useParty(doc?.partyId);
  const branches = useBranches();
  const ewayBill = useActiveEwayBill(doc?.id);
  const [busy, setBusy] = useState(false);

  const html = useMemo(
    () =>
      doc
        ? buildDocumentHtml({
            document: doc,
            company,
            party,
            branchName: branches.find((b) => b.id === doc.branchId)?.name,
            ewayBill,
          })
        : '',
    [doc, company, party, branches, ewayBill],
  );

  if (!doc) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Preview' }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title="Not found" message="This document may have been deleted." />
      </View>
    );
  }

  const label = DOCUMENT_LABELS[doc.kind].singular;

  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${label} ${doc.number}` });
      } else {
        await Share.share({ message: `${label} ${doc.number} — ${formatMoney(doc.totals.grandTotal)}` });
      }
    } catch {
      toast.show('Could not generate the PDF on this device', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Stack.Screen options={{ title: `${label} preview` }} />

      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        scalesPageToFit
        showsVerticalScrollIndicator={false}
      />

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
          title="Print"
          variant="ghost"
          icon="printer-outline"
          onPress={() => Print.printAsync({ html }).catch(() => toast.show('Printing is not available here', 'error'))}
          style={{ flex: 1 }}
        />
        <Button title="Share PDF" icon="share-variant" onPress={share} loading={busy} style={{ flex: 1 }} />
      </View>
      {Platform.OS === 'web' ? null : null}
    </View>
  );
}
