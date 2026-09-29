import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { HubTiles } from '@/components/HubTiles';
import { ComplianceHub } from '@/features/compliance/ComplianceHub';
import { useComplianceSummary } from '@/store/selectors';

/**
 * The Sales plan's GST tab: shortcuts to returns and setup, then the same
 * compliance register the full plan reaches from More.
 */
export default function GstTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance']);
  const summary = useComplianceSummary();

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title="GST" subtitle={tr('compliance:hub.subtitle')} />
      <ComplianceHub
        bottomInset={120}
        header={
          <View style={{ marginBottom: t.spacing.lg }}>
            <HubTiles
              tiles={[
                {
                  key: 'invoices',
                  label: 'Invoices',
                  icon: 'file-document-outline',
                  route: '/(app)/sales/invoices',
                  count: summary.eInvoice.pending + summary.eInvoice.failed || undefined,
                  tone: summary.eInvoice.failed ? 'danger' : 'default',
                },
                { key: 'gstr1', label: 'GSTR-1', icon: 'file-send-outline', route: '/(app)/gst/gstr1' },
                { key: 'transporters', label: 'Transporters', icon: 'truck-outline', route: '/(app)/settings/transporters' },
                { key: 'settings', label: 'GST settings', icon: 'cog-outline', route: '/(app)/settings/e-invoicing' },
              ]}
            />
          </View>
        }
      />
    </View>
  );
}
