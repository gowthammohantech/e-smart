import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { SwitchField, TextField } from '@/components/Field';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '@/store/onboardingStore';
import { COUNTRIES } from '@/data/masters';
import { validGstin } from '@/lib/validators';

export default function TaxStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'errors', 'domain']);
  const router = useRouter();
  const { draft, set } = useOnboardingStore();
  const [error, setError] = useState<string | undefined>();

  const country = COUNTRIES.find((c) => c.code === draft.country);
  const isGst = country?.regime === 'GST';

  const next = () => {
    if (draft.taxRegistered && isGst && draft.country === 'IN') {
      const e = validGstin(draft.taxIdentifier);
      if (e) {
        setError(e);
        return;
      }
    }
    setError(undefined);
    router.push(nextStepRoute('tax', draft.plan));
  };

  return (
    <WizardShell
      title={tr('onboarding:tax.title')}
      subtitle={tr('onboarding:tax.subtitle')}
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('tax', draft.plan)}
      onPrimary={next}
      onSkip={() => router.push(nextStepRoute('tax', draft.plan))}
    >
      <SwitchField
        label={`I'm registered for ${country?.regime === 'VAT' ? 'VAT' : 'GST'}`}
        description={tr('onboarding:tax.registeredHint')}
        value={draft.taxRegistered}
        onValueChange={(v) => set({ taxRegistered: v })}
      />

      {draft.taxRegistered ? (
        <>
          <TextField
            label={country?.taxIdLabel ?? tr('onboarding:tax.numberLabel')}
            value={draft.taxIdentifier}
            onChangeText={(v) => {
              set({ taxIdentifier: v.toUpperCase() });
              setError(undefined);
            }}
            placeholder={draft.country === 'IN' ? '27AABCV1234F1ZO' : tr('onboarding:tax.numberPlaceholder')}
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={error}
            hint={draft.country === 'IN' ? tr('onboarding:tax.stateHint') : undefined}
          />

          {isGst && draft.country === 'IN' ? (
            <SwitchField
              label={tr('onboarding:tax.composition')}
              description={tr('onboarding:tax.compositionHint')}
              value={draft.compositionScheme}
              onValueChange={(v) => set({ compositionScheme: v })}
            />
          ) : null}

          <Card variant="flat" style={{ gap: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Default tax slabs
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {(isGst ? [0, 5, 12, 18, 28] : [0, 5, 20]).map((r) => (
                <Badge key={r} label={`${country?.regime === 'VAT' ? 'VAT' : 'GST'} ${r}%`} tone={r === 18 ? 'info' : 'neutral'} />
              ))}
            </View>
            <Text variant="caption" tone="muted">
              These are created for you. Add or edit slabs any time in Settings → Taxes.
            </Text>
          </Card>
        </>
      ) : (
        <Card variant="flat">
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
            Your invoices will be raised without a tax breakdown. You can register later without losing any history.
          </Text>
        </Card>
      )}
    </WizardShell>
  );
}
