import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { PickerField, SwitchField, TextField } from '@/components/Field';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { ONBOARDING_STEPS, useOnboardingStore } from '@/store/onboardingStore';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { TurnoverSlab } from '@/types';
import { EINVOICE_TURNOVER_SLABS } from '@/domain/gst/applicability';
import { stateNameOf } from '@/domain/gst/stateCodes';
import { stateCodeOfGstin } from '@/domain/gst/gstin';
import { validGstin } from '@/lib/validators';

const SLABS: { value: TurnoverSlab; label: string }[] = [
  { value: 'under5cr', label: 'Under ₹5 crore' },
  { value: '5crTo10cr', label: '₹5 crore to ₹10 crore' },
  { value: '10crTo50cr', label: '₹10 crore to ₹50 crore' },
  { value: 'over50cr', label: 'Over ₹50 crore' },
];

export default function TaxStep() {
  const t = useTheme();
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();
  const [error, setError] = useState<string | undefined>();
  const [slabOpen, setSlabOpen] = useState(false);

  const mandatory = EINVOICE_TURNOVER_SLABS.includes(draft.turnoverSlab);
  const homeState = stateCodeOfGstin(draft.taxIdentifier);

  const next = () => {
    if (draft.taxRegistered) {
      const e = validGstin(draft.taxIdentifier);
      if (e) {
        setError(e);
        return;
      }
      // The GSTIN carries the home state, so there is nothing else to ask.
      setAddress({ stateCode: homeState, state: stateNameOf(homeState) });
    }
    setError(undefined);
    router.push('/(onboarding)/numbering');
  };

  return (
    <WizardShell
      title="Tax registration"
      subtitle="You can change any of this later under Settings."
      steps={ONBOARDING_STEPS}
      currentStep={1}
      onPrimary={next}
      onSkip={() => router.push('/(onboarding)/numbering')}
    >
      <SwitchField
        label="I'm registered under GST"
        description="Turn this off if you invoice without tax."
        value={draft.taxRegistered}
        onValueChange={(v) => set({ taxRegistered: v })}
      />

      {draft.taxRegistered ? (
        <>
          <TextField
            label="GSTIN"
            value={draft.taxIdentifier}
            onChangeText={(v) => {
              set({ taxIdentifier: v.toUpperCase() });
              setError(undefined);
            }}
            placeholder="27AAPFU0939F1ZV"
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={error}
            hint={
              homeState.length === 2
                ? `Home state: ${stateNameOf(homeState)} — supplies elsewhere attract IGST.`
                : 'The first two digits set your home state for CGST/SGST vs IGST.'
            }
          />

          <PickerField
            label="Annual aggregate turnover"
            value={SLABS.find((s) => s.value === draft.turnoverSlab)?.label}
            onPress={() => setSlabOpen(true)}
            icon="chart-line"
            hint={
              mandatory
                ? 'e-Invoicing is mandatory at this turnover — every B2B invoice will need an IRN.'
                : 'e-Invoicing becomes mandatory from ₹5 crore.'
            }
          />

          <SwitchField
            label="Composition scheme"
            description="Turn on if you file under the composition scheme — no tax breakdown and no e-invoices."
            value={draft.compositionScheme}
            onValueChange={(v) => set({ compositionScheme: v })}
          />

          <Card variant="flat" style={{ gap: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Default tax slabs
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {[0, 5, 12, 18, 28].map((r) => (
                <Badge key={r} label={`GST ${r}%`} tone={r === 18 ? 'info' : 'neutral'} />
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

      <SelectSheet
        visible={slabOpen}
        onClose={() => setSlabOpen(false)}
        title="Annual aggregate turnover"
        searchable={false}
        options={SLABS.map((slab) => ({ value: slab.value, label: slab.label }))}
        value={draft.turnoverSlab}
        onSelect={(v) => {
          set({ turnoverSlab: v as TurnoverSlab });
          setSlabOpen(false);
        }}
      />
    </WizardShell>
  );
}
