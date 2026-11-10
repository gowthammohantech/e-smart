import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { WizardShell } from '@esmart/ui/components/WizardShell';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '../../store/onboardingStore';
import { COUNTRIES, INDIAN_STATES } from '@esmart/core/data/masters';
import { useSignOut } from '../../features/session/useSignOut';
import { useGstinLookup, type GstinDetails } from '../../features/gstin/useGstinLookup';
import { validGstin } from '@esmart/core/lib/validators';

export default function TaxStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();
  const signOut = useSignOut();
  const [error, setError] = useState<string | undefined>();
  const country = COUNTRIES.find((c) => c.code === draft.country);
  const isGst = country?.regime === 'GST';

  /** The GSTIN's registered details become the business step's starting point; it can still edit them. */
  const fillFromPortal = (d: GstinDetails) => {
    const patch: Partial<typeof draft> = { prefilledFromGstin: draft.taxIdentifier };
    if (d.legalName) patch.legalName = d.legalName;
    const name = d.tradeName ?? d.legalName;
    if (name) patch.name = name;
    set(patch);
    const a = d.address;
    if (!a) return;
    const street = [a.line1, a.line2].filter(Boolean).join(', ');
    const code = a.stateCode ?? draft.taxIdentifier.slice(0, 2);
    const state = INDIAN_STATES.find((st) => st.code === code);
    setAddress({
      ...(street ? { line1: street } : {}),
      ...(state ? { stateCode: state.code, state: state.name } : {}),
      ...(a.city ? { city: a.city } : {}),
      ...(a.postalCode ? { postalCode: a.postalCode } : {}),
    });
  };
  const gstinLookup = useGstinLookup({
    gstin: draft.taxIdentifier,
    opened: draft.prefilledFromGstin,
    enabled: draft.taxRegistered && isGst && draft.country === 'IN',
    fill: fillFromPortal,
  });

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
      onSkip={() => {
        // Skipping leaves no half-made registration behind: a business marked GST-registered needs a valid GSTIN.
        const india = isGst && draft.country === 'IN';
        if (draft.taxRegistered && (!draft.taxIdentifier.trim() || (india && validGstin(draft.taxIdentifier)))) {
          set({ taxRegistered: false, taxIdentifier: '', compositionScheme: false, prefilledFromGstin: '' });
        }
        setError(undefined);
        router.push(nextStepRoute('tax', draft.plan));
      }}
      onSignOut={signOut}
    >
      <SwitchField
        label={tr('onboarding:tax.registeredFor', { regime: country?.regime === 'VAT' ? 'VAT' : 'GST' })}
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
              // A GSTIN is 15 letters and digits; spaces and dashes from a pasted copy go.
              set({ taxIdentifier: draft.country === 'IN' ? v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15) : v.toUpperCase() });
              setError(undefined);
            }}
            maxLength={draft.country === 'IN' ? 15 : undefined}
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            placeholder={draft.country === 'IN' ? '27AABCV1234F1ZO' : tr('onboarding:tax.numberPlaceholder')}
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={error}
            hint={gstinLookup.hint ?? (draft.country === 'IN' ? tr('onboarding:tax.stateHint') : undefined)}
            suffix={gstinLookup.suffix}
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
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('onboarding:tax.defaultSlabs')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {(isGst ? [0, 5, 12, 18, 28] : [0, 5, 20]).map((r) => (
                <Badge key={r} label={`${country?.regime === 'VAT' ? 'VAT' : 'GST'} ${r}%`} tone={r === 18 ? 'info' : 'neutral'} />
              ))}
            </View>
            <Text variant="caption" tone="muted">
              {tr('onboarding:tax.slabsNote')}
            </Text>
          </Card>
        </>
      ) : (
        <Card variant="flat">
          <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>{tr('onboarding:tax.unregisteredNote')}</Text>
        </Card>
      )}
    </WizardShell>
  );
}
