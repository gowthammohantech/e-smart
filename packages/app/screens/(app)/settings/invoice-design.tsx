import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { buildDocumentHtml } from '@esmart/core/render/documentHtml';
import { DEFAULT_ACCENT, type InvoiceTemplate } from '@esmart/core/render/invoiceTemplate';
import { useServerSave } from '../../../components/useServerSave';
import { HtmlPreview } from '../../../features/documents/HtmlPreview';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBranches, useDocuments, useParty } from '../../../store/selectors';

/** Colours that print well on white and read on a phone. */
const ACCENTS = [DEFAULT_ACCENT, '#0B6E4F', '#B42318', '#6941C6', '#C4320A', '#1D2939'];

/**
 * How this business's invoices, quotes and other documents look: accent colour, which optional
 * columns print, the logo, a footer line and a compact size. Statutory content always prints.
 * The preview is the latest invoice with the choices applied.
 */
export default function InvoiceDesignScreen() {
  const t = useTheme();
  // A desktop puts the controls beside the preview, so a change shows without scrolling.
  const desktop = useIsDesktop();
  const { t: tr, i18n } = useTranslation(['settings']);
  const company = useActiveCompany();
  const branches = useBranches();
  const saveCompany = useAppStore((s) => s.saveCompany);
  const { run: serverSave, saving } = useServerSave();
  const [tpl, setTpl] = useState<InvoiceTemplate>(company.invoiceTemplate ?? {});
  const latest = useDocuments('invoice')[0];
  const party = useParty(latest?.partyId);
  const set = (p: Partial<InvoiceTemplate>) => setTpl((x) => ({ ...x, ...p }));
  const on = (k: keyof InvoiceTemplate) => tpl[k] !== false;

  const html = useMemo(
    () =>
      latest
        ? buildDocumentHtml({ document: latest, company, party, branch: branches.find((b) => b.id === latest.branchId), template: tpl, t: tr, language: i18n.language === 'ta' ? 'ta' : 'en' })
        : '',
    [latest, company, party, branches, tpl, tr, i18n.language],
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('settings:invoiceDesign.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('settings:invoiceDesign.hint')}
        </Text>
        <View style={desktop ? { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xl } : { gap: t.spacing.lg }}>
          <Card style={[{ gap: t.spacing.md }, desktop ? { width: 360 } : null]}>
            <Text variant="body" weight="600">
              {tr('settings:invoiceDesign.accent')}
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
              {ACCENTS.map((c) => {
                const picked = (tpl.accentColor ?? DEFAULT_ACCENT).toLowerCase() === c.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    onPress={() => set({ accentColor: c })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked }}
                    accessibilityLabel={c}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: picked ? 3 : 0, borderColor: t.c.text }}
                  />
                );
              })}
            </View>
            <SwitchField label={tr('settings:invoiceDesign.discountColumn')} value={on('showDiscountColumn')} onValueChange={(v) => set({ showDiscountColumn: v })} />
            <SwitchField label={tr('settings:invoiceDesign.taxColumn')} value={on('showTaxColumn')} onValueChange={(v) => set({ showTaxColumn: v })} />
            <SwitchField label={tr('settings:invoiceDesign.hsn')} value={on('showHsn')} onValueChange={(v) => set({ showHsn: v })} />
            <SwitchField label={tr('settings:invoiceDesign.logo')} value={on('showLogo')} onValueChange={(v) => set({ showLogo: v })} />
            <SwitchField label={tr('settings:invoiceDesign.compact')} description={tr('settings:invoiceDesign.compactHint')} value={!!tpl.compact} onValueChange={(v) => set({ compact: v })} />
            <TextField label={tr('settings:invoiceDesign.footer')} value={tpl.footerText ?? ''} onChangeText={(v) => set({ footerText: v })} maxLength={200} hint={tr('settings:invoiceDesign.footerHint')} />
            <Button
              title={tr('settings:invoiceDesign.save')}
              onPress={() => void serverSave(() => saveCompany({ ...company, invoiceTemplate: tpl }), tr('settings:invoiceDesign.saved'), { icon: 'file-document-outline' })}
              loading={saving}
              disabled={saving}
            />
          </Card>
          {html ? (
            <Card padded={false} style={[{ height: 720, overflow: 'hidden' }, desktop ? { flex: 1, minWidth: 0 } : null]}>
              <HtmlPreview html={html} style={{ flex: 1 }} />
            </Card>
          ) : (
            <Text variant="small" tone="muted">
              {tr('settings:invoiceDesign.noInvoice')}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
