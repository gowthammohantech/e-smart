import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { Card } from '@esmart/ui/components/Card';
import { AmountField, SwitchField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { documentKindLabel } from '@esmart/core/labels';
import { fromMajor, toMajor } from '@esmart/core/lib/money';
import type { DocumentKind } from '@esmart/core/types';
import { CardGrid } from '../../../features/settings/CardGrid';
import { useServerSave } from '../../../components/useServerSave';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useCurrentUser } from '../../../store/selectors';

/** The kinds worth holding for approval: what commits the business to money. */
const KINDS: (DocumentKind | 'payment')[] = ['invoice', 'creditNote', 'purchaseOrder', 'purchaseBill', 'supplierDebitNote', 'salesOrder', 'quote', 'proforma', 'payment'];

/** Which documents wait for an owner or admin before they are issued, and over what amount. */
export default function ApprovalRulesScreen() {
  // Keyed by business: on the web the page stays open across a switch, and what it copied or fetched
  // at mount belongs to the business it opened on.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <ApprovalRulesScreenBody key={companyId} />;
}

function ApprovalRulesScreenBody() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'domain']);
  const company = useActiveCompany();
  const currency = useBaseCurrency();
  const owner = useCurrentUser()?.role === 'owner';
  const saveCompany = useAppStore((s) => s.saveCompany);
  const { run: serverSave, saving } = useServerSave();
  const current = company.approvalRules ?? [];
  const [rules, setRules] = useState<Record<string, string | null>>(() => Object.fromEntries(current.map((r) => [r.kind, String(toMajor({ minor: r.overMinor, currency }))])));

  const save = () =>
    serverSave(
      () =>
        saveCompany({
          ...company,
          approvalRules: Object.entries(rules)
            .filter(([, v]) => v !== null)
            .map(([kind, v]) => ({ kind: kind as DocumentKind | 'payment', overMinor: fromMajor(v || '0', currency).minor })),
        }),
      tr('settings:approvals.saved'),
      { icon: 'clipboard-check-outline' },
    );

  const desktop = useIsDesktop();
  useSaveShortcut(() => void save(), owner && !saving);

  const rule = (k: DocumentKind | 'payment') => {
    const on = rules[k] !== undefined && rules[k] !== null;
    return (
      <>
        <SwitchField label={k === 'payment' ? tr('settings:approvals.payments') : documentKindLabel(tr, k, 2)} value={on} onValueChange={(v) => setRules({ ...rules, [k]: v ? '0' : null })} disabled={!owner} />
        {on ? <AmountField label={tr('settings:approvals.over')} value={rules[k] ?? ''} onChangeValue={(v) => setRules({ ...rules, [k]: v })} currency={currency} hint={tr('settings:approvals.overHint')} /> : null}
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('settings:approvals.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr(owner ? 'settings:approvals.hint' : 'settings:approvals.ownerOnly')}
        </Text>
        {desktop ? (
          // A tile per document kind across the page, so each switch and amount sits near its label.
          <CardGrid per="auto">
            {KINDS.map((k) => (
              <Card key={k} style={{ flex: 1, gap: t.spacing.sm }}>
                {rule(k)}
              </Card>
            ))}
          </CardGrid>
        ) : (
          <Card style={{ gap: t.spacing.md }}>
            {KINDS.map((k) => (
              <View key={k} style={{ gap: t.spacing.sm }}>
                {rule(k)}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
      {/* Saved from the bar under the form, as every settings screen with typed input is. */}
      {owner ? (
        <FormActions>
          <Button shortcut="S" title={tr('settings:approvals.save')} onPress={() => void save()} loading={saving} disabled={saving} fullWidth={!desktop}
          size={desktop ? undefined : 'lg'} />
        </FormActions>
      ) : null}
    </View>
    </KeyboardAvoidingView>
  );
}
