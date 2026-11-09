import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { WizardShell } from '@esmart/ui/components/WizardShell';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '../../store/onboardingStore';
import { financialYearOf, today } from '@esmart/core/lib/date';
import { E_INVOICE_DOC_NUMBER_MAX, sanitizePrefix } from '@esmart/core/lib/validators';
import { useFieldWidth } from '@esmart/ui/theme/breakpoints';

export default function NumberingStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'settings']);
  const router = useRouter();
  const { draft, set } = useOnboardingStore();
  // A prefix and a start number are a few characters: a desktop keeps them short, side by side.
  const short = useFieldWidth()('sm') ?? { flex: 1 };

  const fy = financialYearOf(today(), draft.fiscalYearStartMonth);
  const seq = String(Number(draft.invoiceNextNumber) || 1).padStart(4, '0');
  const preview = [draft.invoicePrefix.replace(/\/+$/, '') || 'INV', draft.includeFiscalYear ? fy.label.replace('FY ', '') : null, seq]
    .filter(Boolean)
    .join('/');
  const tooLong = preview.length > E_INVOICE_DOC_NUMBER_MAX;

  return (
    <WizardShell
      title={tr('onboarding:numbering.title')}
      subtitle={tr('onboarding:numbering.subtitle')}
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('numbering', draft.plan)}
      onPrimary={() => router.push(nextStepRoute('numbering', draft.plan))}
      onSkip={() => router.push(nextStepRoute('numbering', draft.plan))}
    >
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: t.spacing.xl }}>
        <Text variant="caption" tone="muted">{tr('onboarding:numbering.nextWillBe')}</Text>
        {/* A long prefix wraps rather than running off the card. */}
        <Text variant="h2" weight="700" center style={{ color: t.c.primary, fontVariant: ['tabular-nums'], maxWidth: '100%' }}>
          {preview}
        </Text>
        {tooLong ? (
          <Text variant="caption" tone="warn" center accessibilityRole="alert">
            {tr('settings:numbering.tooLongForEInvoice', { count: E_INVOICE_DOC_NUMBER_MAX })}
          </Text>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <TextField
          label={tr('onboarding:numbering.prefix')}
          value={draft.invoicePrefix}
          onChangeText={(v) => set({ invoicePrefix: sanitizePrefix(v) })}
          placeholder="INV"
          autoCapitalize="characters"
          containerStyle={short}
        />
        <TextField
          label={tr('onboarding:numbering.startFrom')}
          value={draft.invoiceNextNumber}
          onChangeText={(v) => set({ invoiceNextNumber: v.replace(/[^0-9]/g, '') })}
          placeholder="1"
          keyboardType="number-pad"
          containerStyle={short}
        />
      </View>

      <SwitchField
        label={tr('onboarding:numbering.includeFy')}
        description={tr('onboarding:numbering.includeFyHint', { fy: fy.label.replace('FY ', '') })}
        value={draft.includeFiscalYear}
        onValueChange={(v) => set({ includeFiscalYear: v })}
      />

      <Card variant="flat">
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          {tr('onboarding:numbering.seriesNote')}
        </Text>
      </Card>
    </WizardShell>
  );
}
