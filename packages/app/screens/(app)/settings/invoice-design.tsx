import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Icon } from '@esmart/ui/components/Icon';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import type { BusinessDocument, Party } from '@esmart/core/types';
import { Card } from '@esmart/ui/components/Card';
import { Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { buildDocumentHtml } from '@esmart/core/render/documentHtml';
import {
  DEFAULT_DECLARATION,
  INVOICE_LAYOUTS,
  LAYOUT_TOGGLES,
  resolveTemplate,
  tint,
  type InvoiceLayout,
  type InvoiceTemplate,
  type TemplateToggle,
} from '@esmart/core/render/invoiceTemplate';
import { useServerSave } from '../../../components/useServerSave';
import { HtmlPreview } from '../../../features/documents/HtmlPreview';
import { LayoutThumb } from '../../../features/documents/LayoutThumb';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBranches } from '../../../store/selectors';
import { useDocumentPages, useDocumentRecord } from '../../../remote/queries';
import { useSaveShortcut } from '../../../components/useSaveShortcut';

/** Colours that print well on white and read on a phone. */
const ACCENTS = [
  { hex: '#007AFF', name: 'blue' },
  { hex: '#13294B', name: 'navy' },
  { hex: '#0B6E4F', name: 'green' },
  { hex: '#B42318', name: 'red' },
  { hex: '#6941C6', name: 'purple' },
  { hex: '#C4320A', name: 'orange' },
  { hex: '#C8930B', name: 'gold' },
  { hex: '#1D2939', name: 'charcoal' },
] as const;

/** Each switch's label, and its hint where it needs one. */
const TOGGLE_LABEL = {
  showDiscountColumn: 'discountColumn',
  showTaxColumn: 'taxColumn',
  showHsn: 'hsn',
  showLogo: 'logo',
  showHsnSummary: 'hsnSummary',
  showBank: 'bank',
  showSignature: 'signature',
  showDeclaration: 'declaration',
  showShipTo: 'shipTo',
  showPanTan: 'panTan',
  showCustomerSeal: 'customerSeal',
  compact: 'compact',
} as const satisfies Record<TemplateToggle, string>;

/**
 * How this business's invoices, quotes and other documents look: a ready-made template, its accent
 * colour and logo side, and what prints. Statutory content always prints. The preview is the latest
 * invoice with the choices applied; an invoice can be printed in another template from its preview.
 */
export default function InvoiceDesignScreen() {
  // Keyed by business: on the web the page stays open across a switch, and what it copied or fetched
  // at mount belongs to the business it opened on.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <InvoiceDesignScreenBody key={companyId} />;
}

function InvoiceDesignScreenBody() {
  const t = useTheme();
  // A desktop puts the controls beside the preview, so a change shows without scrolling.
  const desktop = useIsDesktop();
  const { t: tr, i18n } = useTranslation(['settings']);
  const company = useActiveCompany();
  const branches = useBranches();
  const saveCompany = useAppStore((s) => s.saveCompany);
  const { run: serverSave, saving } = useServerSave();
  const [tpl, setTpl] = useState<InvoiceTemplate>(company.invoiceTemplate ?? {});
  // The latest invoice from the server (the device keeps no full list), opened whole for its lines and party.
  const latestPage = useDocumentPages({ kinds: ['invoice'] });
  const latestId = latestPage.rows[0]?.id;
  const record = useDocumentRecord(latestId);
  const latest = record.data as unknown as (BusinessDocument & { party?: Party }) | undefined;
  const party = latest?.party;
  const previewLoading = latestPage.isLoading || (!!latestId && !latest && !record.isError);
  const save = () => serverSave(() => saveCompany({ ...company, invoiceTemplate: tpl }), tr('settings:invoiceDesign.saved'), { icon: 'file-document-outline' });
  useSaveShortcut(() => void save(), !saving);
  const set = (p: Partial<InvoiceTemplate>) => setTpl((x) => ({ ...x, ...p }));
  const resolved = resolveTemplate(tpl);
  const layout = resolved.layout;

  const html = useMemo(
    () =>
      latest
        ? buildDocumentHtml({
            document: latest,
            company,
            party,
            branch: branches.find((b) => b.id === latest.branchId),
            template: tpl,
            // The business's template, not the invoice's own choice, is what this screen shows.
            layout: resolveTemplate(tpl).layout,
            t: tr,
            language: i18n.language === 'ta' ? 'ta' : 'en',
          })
        : '',
    [latest, company, party, branches, tpl, tr, i18n.language],
  );

  const pickLayout = (l: InvoiceLayout) => set({ layout: l });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('settings:invoiceDesign.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('settings:invoiceDesign.hint')}
        </Text>
        <View style={desktop ? { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xl } : { gap: t.spacing.lg }}>
          <View style={[{ gap: t.spacing.lg }, desktop ? { width: 380 } : null]}>
            <Card style={{ gap: t.spacing.md }}>
              <View style={{ gap: t.spacing.xxs }}>
                <Text variant="body" weight="600">
                  {tr('settings:invoiceDesign.layout')}
                </Text>
                <Text variant="caption" tone="muted">
                  {tr('settings:invoiceDesign.layoutHint')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }} accessibilityRole="radiogroup">
                {INVOICE_LAYOUTS.map((l) => {
                  const picked = l === layout;
                  const name = tr(`settings:invoiceDesign.layouts.${l}.name`);
                  return (
                    <Pressable
                      key={l}
                      onPress={() => pickLayout(l)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: picked, checked: picked }}
                      accessibilityLabel={`${name}. ${tr(`settings:invoiceDesign.layouts.${l}.description`)}`}
                      style={({ pressed }) => ({
                        // Two to a row on a phone, four across the desktop panel's two rows.
                        flexBasis: '47%',
                        flexGrow: 1,
                        flexDirection: 'row',
                        gap: t.spacing.sm,
                        alignItems: 'center',
                        padding: t.spacing.sm,
                        borderRadius: t.radius.md,
                        borderWidth: 2,
                        borderColor: picked ? t.c.primary : t.c.line,
                        backgroundColor: picked ? tint(t.c.primary, 0.08) : t.c.card,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <LayoutThumb layout={l} accent={l === layout ? resolved.accentColor : resolveTemplate({ layout: l }).accentColor} width={44} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text variant="small" weight="600" style={{ flexShrink: 1 }}>
                            {name}
                          </Text>
                          {picked ? <Icon name="check-circle" size={14} color={t.c.primary} /> : null}
                        </View>
                        <Text variant="caption" tone="muted">
                          {tr(`settings:invoiceDesign.layouts.${l}.description`)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <Card style={{ gap: t.spacing.md }}>
              <Text variant="body" weight="600">
                {tr('settings:invoiceDesign.accent')}
              </Text>
              <View style={{ flexDirection: 'row', gap: t.spacing.xs, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
                {ACCENTS.map((c) => {
                  const picked = resolved.accentColor.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <Pressable
                      key={c.hex}
                      onPress={() => set({ accentColor: c.hex })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: picked, checked: picked }}
                      accessibilityLabel={tr(`settings:invoiceDesign.colour.${c.name}`)}
                      // A 44pt target; the chosen one gets a ring in the text colour, clear of the swatch, on light or dark.
                      style={{ width: 44, height: 44, borderRadius: 22, padding: 4, borderWidth: 2, borderColor: picked ? t.c.text : 'transparent' }}
                    >
                      <View style={{ flex: 1, borderRadius: 16, backgroundColor: c.hex, alignItems: 'center', justifyContent: 'center' }}>
                        {picked ? <Icon name="check" size={16} color={c.name === 'gold' ? '#111111' : '#FFFFFF'} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {layout !== 'standard' ? (
                <View style={{ gap: t.spacing.xs }}>
                  <Text variant="small" weight="600">
                    {tr('settings:invoiceDesign.logoPosition')}
                  </Text>
                  <Segmented
                    options={[
                      { value: 'left', label: tr('settings:invoiceDesign.logoLeft') },
                      { value: 'right', label: tr('settings:invoiceDesign.logoRight') },
                    ]}
                    value={resolved.logoPosition}
                    onChange={(v) => set({ logoPosition: v })}
                  />
                </View>
              ) : null}
            </Card>

            <Card style={{ gap: t.spacing.md }}>
              <Text variant="body" weight="600">
                {tr('settings:invoiceDesign.sections')}
              </Text>
              {LAYOUT_TOGGLES[layout].map((k) => (
                <SwitchField
                  key={k}
                  label={tr(`settings:invoiceDesign.${TOGGLE_LABEL[k]}`)}
                  description={k === 'compact' ? tr('settings:invoiceDesign.compactHint') : undefined}
                  value={resolved[k]}
                  onValueChange={(v) => set({ [k]: v })}
                />
              ))}
              {LAYOUT_TOGGLES[layout].includes('showDeclaration') && resolved.showDeclaration ? (
                <TextField
                  label={tr('settings:invoiceDesign.declarationText')}
                  value={tpl.declarationText ?? ''}
                  placeholder={DEFAULT_DECLARATION}
                  onChangeText={(v) => set({ declarationText: v })}
                  maxLength={300}
                  multiline
                />
              ) : null}
              <TextField label={tr('settings:invoiceDesign.footer')} value={tpl.footerText ?? ''} onChangeText={(v) => set({ footerText: v })} maxLength={200} hint={tr('settings:invoiceDesign.footerHint')} />
            </Card>
          </View>
          {previewLoading ? (
            <SkeletonGroup style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <Skeleton height={desktop ? 720 : 420} radius={t.radius.lg} />
            </SkeletonGroup>
          ) : html ? (
            <Card padded={false} style={[{ height: desktop ? 900 : 720, overflow: 'hidden' }, desktop ? { flex: 1, minWidth: 0 } : null]}>
              <HtmlPreview html={html} style={{ flex: 1 }} />
            </Card>
          ) : (
            <Text variant="small" tone="muted">
              {tr('settings:invoiceDesign.noInvoice')}
            </Text>
          )}
        </View>
      </ScrollView>
      {/* Saved from the bar under the form, as every settings screen with typed input is. */}
      <FormActions>
        <Button shortcut="S" title={tr('settings:invoiceDesign.save')} onPress={() => void save()} loading={saving} disabled={saving} fullWidth={!desktop}
          size={desktop ? undefined : 'lg'} />
      </FormActions>
    </View>
  );
}
