import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Illustration } from '@/components/Illustration';
import { useAppStore } from '@/store/appStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { COUNTRIES } from '@/data/masters';
import { uid } from '@/lib/id';

const NEXT_STEPS: { icon: keyof typeof MaterialCommunityIcons.glyphMap; labelKey: string; bodyKey: string }[] = [
  { icon: 'account-plus-outline', labelKey: 'customersLabel', bodyKey: 'customersBody' },
  { icon: 'tag-outline', labelKey: 'itemsLabel', bodyKey: 'itemsBody' },
  { icon: 'file-document-outline', labelKey: 'invoiceLabel', bodyKey: 'invoiceBody' },
];

export default function Done() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, reset } = useOnboardingStore();
  const [busy, setBusy] = useState(false);

  const createCompany = useAppStore((s) => s.createCompany);
  const saveBranch = useAppStore((s) => s.saveBranch);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const numberingSeries = useAppStore((s) => s.numberingSeries);
  const saveNumberingSeries = useAppStore((s) => s.saveNumberingSeries);

  const finish = (goToInvoice: boolean) => {
    setBusy(true);
    const country = COUNTRIES.find((c) => c.code === draft.country);

    const companyId = createCompany({
      name: draft.name || tr('onboarding:done.defaultName'),
      legalName: draft.legalName || undefined,
      logoUri: draft.logoUri,
      businessType: draft.businessType,
      plan: draft.plan,
      country: draft.country,
      baseCurrency: draft.baseCurrency,
      address: draft.address,
      email: draft.email || undefined,
      phone: draft.phone || undefined,
      fiscalYearStartMonth: draft.fiscalYearStartMonth,
      taxRegistration: {
        regime: country?.regime ?? 'NONE',
        identifier: draft.taxIdentifier || undefined,
        identifierLabel: country?.taxIdLabel ?? tr('onboarding:done.defaultTaxLabel'),
        registered: draft.taxRegistered,
        compositionScheme: draft.compositionScheme,
        placeOfSupplyStateCode: draft.address.stateCode,
      },
    });

    draft.branches.forEach((b) => {
      saveBranch({
        id: uid('brn'),
        companyId,
        name: b.name,
        code: b.code,
        address: { ...draft.address, city: b.city || draft.address.city },
        isPrimary: false,
      });
    });

    // Apply the numbering choices to the newly created invoice series.
    const series = useAppStore
      .getState()
      .numberingSeries.find((s) => s.companyId === companyId && s.kind === 'invoice');
    if (series) {
      saveNumberingSeries({
        ...series,
        prefix: draft.invoicePrefix || 'INV',
        nextNumber: Number(draft.invoiceNextNumber) || 1,
        includeFiscalYear: draft.includeFiscalYear,
      });
    }
    void numberingSeries;

    completeOnboarding();
    reset();
    router.replace(goToInvoice ? '/(app)/sales/invoices/new' : '/(app)/(tabs)');
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.c.bg,
        paddingTop: insets.top + t.spacing.xxxl,
        paddingHorizontal: t.spacing.xl,
        paddingBottom: insets.bottom + t.spacing.xl,
      }}
    >
      <View style={{ flex: 1, gap: t.spacing.xxl }}>
        <View style={{ alignItems: 'center', gap: t.spacing.lg }}>
          <Illustration name="setup-complete" size="hero" />
          <View style={{ gap: 6 }}>
            <Text variant="h2" center>
              {tr('onboarding:done.readyTitle', { business: draft.name || tr('onboarding:done.fallbackBusiness') })}
            </Text>
            <Text variant="small" tone="muted" center style={{ lineHeight: 20 }}>{tr('onboarding:done.allSet')}</Text>
          </View>
        </View>

        <View style={{ gap: t.spacing.md }}>
          {NEXT_STEPS.map((s) => (
            <Card key={s.labelKey} variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.sm,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name={s.icon} size={19} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600">
                  {tr(`onboarding:done.next.${s.labelKey}` as 'onboarding:done.next.customersLabel')}
                </Text>
                <Text variant="caption" tone="muted">
                  {tr(`onboarding:done.next.${s.bodyKey}` as 'onboarding:done.next.customersBody')}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      <View style={{ gap: t.spacing.md }}>
        <Button title={tr('onboarding:done.createInvoice')} onPress={() => finish(true)} loading={busy} fullWidth size="lg" />
        <Button title={tr('onboarding:done.goToDashboard')} variant="ghost" onPress={() => finish(false)} fullWidth />
      </View>
    </View>
  );
}
