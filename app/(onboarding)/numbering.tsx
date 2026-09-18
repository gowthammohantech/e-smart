import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { SwitchField, TextField } from '@/components/Field';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { ONBOARDING_STEPS, useOnboardingStore } from '@/store/onboardingStore';
import { financialYearOf, today } from '@/lib/date';

export default function NumberingStep() {
  const t = useTheme();
  const router = useRouter();
  const { draft, set } = useOnboardingStore();

  const fy = financialYearOf(today(), draft.fiscalYearStartMonth);
  const seq = String(Number(draft.invoiceNextNumber) || 1).padStart(4, '0');
  const preview = [draft.invoicePrefix || 'INV', draft.includeFiscalYear ? fy.label.replace('FY ', '') : null, seq]
    .filter(Boolean)
    .join('/');

  return (
    <WizardShell
      title="Invoice numbering"
      subtitle="Finalised numbers are never reused, so pick a format you're happy with."
      steps={ONBOARDING_STEPS}
      currentStep={3}
      onPrimary={() => router.push('/(onboarding)/done')}
      onSkip={() => router.push('/(onboarding)/done')}
    >
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: t.spacing.xl }}>
        <Text variant="caption" tone="muted">
          Your next invoice will be
        </Text>
        <Text variant="h2" weight="700" style={{ color: t.c.primary, fontVariant: ['tabular-nums'] }}>
          {preview}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <TextField
          label="Prefix"
          value={draft.invoicePrefix}
          onChangeText={(v) => set({ invoicePrefix: v.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
          placeholder="INV"
          autoCapitalize="characters"
          containerStyle={{ flex: 1 }}
        />
        <TextField
          label="Start from"
          value={draft.invoiceNextNumber}
          onChangeText={(v) => set({ invoiceNextNumber: v.replace(/[^0-9]/g, '') })}
          placeholder="1"
          keyboardType="number-pad"
          containerStyle={{ flex: 1 }}
        />
      </View>

      <SwitchField
        label="Include financial year"
        description={`Adds ${fy.label.replace('FY ', '')} to every number and restarts the sequence each year.`}
        value={draft.includeFiscalYear}
        onValueChange={(v) => set({ includeFiscalYear: v })}
      />

      <Card variant="flat">
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          Quotations, sales orders, delivery notes, credit notes and payments each get their own series with matching
          settings. You can tune
          them individually in Settings → Numbering.
        </Text>
      </Card>
    </WizardShell>
  );
}
