import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { SwitchField, TextField } from '@/components/Field';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '@/store/onboardingStore';
import { financialYearOf, today } from '@/lib/date';

export default function NumberingStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const { draft, set } = useOnboardingStore();

  const fy = financialYearOf(today(), draft.fiscalYearStartMonth);
  const seq = String(Number(draft.invoiceNextNumber) || 1).padStart(4, '0');
  const preview = [draft.invoicePrefix || 'INV', draft.includeFiscalYear ? fy.label.replace('FY ', '') : null, seq]
    .filter(Boolean)
    .join('/');

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
        <Text variant="h2" weight="700" style={{ color: t.c.primary, fontVariant: ['tabular-nums'] }}>
          {preview}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <TextField
          label={tr('onboarding:numbering.prefix')}
          value={draft.invoicePrefix}
          onChangeText={(v) => set({ invoicePrefix: v.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
          placeholder="INV"
          autoCapitalize="characters"
          containerStyle={{ flex: 1 }}
        />
        <TextField
          label={tr('onboarding:numbering.startFrom')}
          value={draft.invoiceNextNumber}
          onChangeText={(v) => set({ invoiceNextNumber: v.replace(/[^0-9]/g, '') })}
          placeholder="1"
          keyboardType="number-pad"
          containerStyle={{ flex: 1 }}
        />
      </View>

      <SwitchField
        label={tr('onboarding:numbering.includeFy')}
        description={`Adds ${fy.label.replace('FY ', '')} to every number and restarts the sequence each year.`}
        value={draft.includeFiscalYear}
        onValueChange={(v) => set({ includeFiscalYear: v })}
      />

      <Card variant="flat">
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          Quotes, purchase bills, payments and expenses each get their own series with matching settings. You can tune
          them individually in Settings → Numbering.
        </Text>
      </Card>
    </WizardShell>
  );
}
