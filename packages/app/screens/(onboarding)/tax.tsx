import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { WizardShell } from '@esmart/ui/components/WizardShell';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '../../store/onboardingStore';
import { COUNTRIES, INDIAN_STATES, defaultTaxRates } from '@esmart/core/data/masters';
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
  // The rates the business starts with: the regime's defaults, as kept, dropped or added to here.
  const regime = country?.regime === 'VAT' ? 'VAT' : 'GST';
  const taxName = regime === 'VAT' ? 'VAT' : 'GST';
  const defaults = defaultTaxRates(regime);
  const rates = draft.taxRates ?? defaults;
  const shownRates = [...new Set([...defaults, ...rates])].sort((a, b) => a - b);
  const [rateText, setRateText] = useState('');
  // At least one rate stays: a business registered for tax needs one to charge.
  const toggleRate = (r: number) => set({ taxRates: rates.includes(r) ? (rates.length > 1 ? rates.filter((x) => x !== r) : rates) : [...rates, r].sort((a, b) => a - b) });
  const addRate = () => {
    const r = Number(rateText);
    if (rateText && Number.isFinite(r) && r >= 0 && r <= 100 && !rates.includes(r)) set({ taxRates: [...rates, r].sort((a, b) => a - b) });
    setRateText('');
  };

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

          {/* The rates the business starts with: tap one to leave it out or bring it back, or add another. */}
          <Card variant="flat" style={{ gap: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('onboarding:tax.defaultSlabs')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {shownRates.map((r) => {
                const on = rates.includes(r);
                return (
                  <Pressable
                    key={r}
                    onPress={() => toggleRate(r)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${taxName} ${r}%`}
                    style={{ opacity: on ? 1 : 0.5 }}
                  >
                    <Badge label={`${taxName} ${r}%`} tone={on ? 'info' : 'neutral'} icon={on ? 'check' : 'plus'} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.sm }}>
              <TextField
                label={tr('onboarding:tax.addRate')}
                value={rateText}
                onChangeText={(v) => setRateText(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="3"
                containerStyle={{ flex: 1 }}
                onSubmitEditing={addRate}
              />
              <Button title={tr('onboarding:tax.add')} variant="ghost" icon="plus" onPress={addRate} disabled={!rateText} />
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
