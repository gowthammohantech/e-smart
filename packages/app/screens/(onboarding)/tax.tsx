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
import { validGstin } from '@esmart/core/lib/validators';
import { useGstinLookup, type GstinDetails } from '../../features/gstin/useGstinLookup';

export default function TaxStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();
  const [error, setError] = useState<string | undefined>();
  // Set once the portal has filled the business in, to show what it put there.
  const [filled, setFilled] = useState(false);

  const country = COUNTRIES.find((c) => c.code === draft.country);
  const isGst = country?.regime === 'GST';

  // The GSTIN is the head office's: the GST portal's record of it fills in the
  // legal name and the registered address the head-office branch is made with.
  const fillFromPortal = (d: GstinDetails) => {
    const legal = d.legalName ?? d.tradeName;
    if (legal) set({ legalName: legal, ...(draft.name.trim() ? {} : { name: d.tradeName ?? legal }) });
    if (d.registrationType === 'composition') set({ compositionScheme: true });
    const a = d.address;
    if (a) {
      const code = a.stateCode ?? draft.taxIdentifier.slice(0, 2);
      const state = INDIAN_STATES.find((s) => s.code === code);
      setAddress({
        ...(a.line1 ? { line1: [a.line1, a.line2].filter(Boolean).join(', ') } : {}),
        ...(a.city ? { city: a.city } : {}),
        ...(state ? { state: state.name, stateCode: state.code } : {}),
        ...(a.postalCode ? { postalCode: a.postalCode } : {}),
      });
    }
    setFilled(true);
  };
  const gstinLookup = useGstinLookup({
    gstin: draft.taxIdentifier,
    enabled: draft.taxRegistered && isGst && draft.country === 'IN',
    fill: fillFromPortal,
  });
  const where = [draft.address.line1, draft.address.city, draft.address.state, draft.address.postalCode].filter(Boolean).join(', ');

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
              set({ taxIdentifier: v.toUpperCase() });
              setError(undefined);
            }}
            placeholder={draft.country === 'IN' ? '27AABCV1234F1ZO' : tr('onboarding:tax.numberPlaceholder')}
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={error}
            hint={gstinLookup.hint ?? (draft.country === 'IN' ? tr('onboarding:tax.stateHint') : undefined)}
            suffix={gstinLookup.suffix}
          />

          {filled && gstinLookup.suffix ? (
            <Card variant="flat" style={{ gap: t.spacing.xs }}>
              <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {tr('onboarding:tax.fromPortal')}
              </Text>
              <Text variant="body" weight="600">{draft.legalName}</Text>
              {where ? <Text variant="small" tone="muted">{where}</Text> : null}
            </Card>
          ) : null}

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
