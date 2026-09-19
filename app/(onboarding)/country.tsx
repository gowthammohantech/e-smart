import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { WizardShell } from '@/components/WizardShell';
import { PickerField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { nextStepRoute, onboardingSteps, stepIndex, useOnboardingStore } from '@/store/onboardingStore';
import { COUNTRIES } from '@/data/masters';
import { CURRENCIES } from '@/lib/currencies';
import { monthNames } from '@/lib/date';

export default function CountryStep() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();

  const [countryOpen, setCountryOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);

  const country = COUNTRIES.find((c) => c.code === draft.country);
  const currency = CURRENCIES.find((c) => c.code === draft.baseCurrency);

  return (
    <WizardShell
      title={tr('onboarding:country.title')}
      subtitle={tr('onboarding:country.subtitle')}
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('country', draft.plan)}
      onPrimary={() => router.push(nextStepRoute('country', draft.plan))}
    >
      <PickerField
        label={tr('onboarding:country.country')}
        value={country?.name}
        onPress={() => setCountryOpen(true)}
        icon="earth"
        required
      />
      <PickerField
        label={tr('onboarding:country.baseCurrency')}
        value={currency ? `${currency.name} (${currency.symbol})` : undefined}
        onPress={() => setCurrencyOpen(true)}
        icon="cash-multiple"
        required
        hint={tr('onboarding:country.currencyHint')}
      />
      <PickerField
        label={tr('onboarding:country.fyStarts')}
        value={monthNames()[draft.fiscalYearStartMonth - 1]}
        onPress={() => setFyOpen(true)}
        icon="calendar-range"
      />

      <Card variant="flat" style={{ gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {tr('onboarding:country.whatYouGet', { country: country?.name })}
        </Text>
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          {country?.regime === 'GST'
            ? tr('onboarding:country.gstPack', { taxIdLabel: country.taxIdLabel, country: country.name })
            : country?.regime === 'VAT'
              ? tr('onboarding:country.vatPack', { taxIdLabel: country.taxIdLabel })
              : tr('onboarding:country.nonePack')}
        </Text>
      </Card>

      <SelectSheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        title={tr('onboarding:country.country')}
        options={COUNTRIES.map((c) => ({ value: c.code, label: c.name, description: `${c.regime} · ${c.currency}` }))}
        value={draft.country}
        onSelect={(code) => {
          const c = COUNTRIES.find((x) => x.code === code);
          if (!c) return;
          set({
            country: code,
            baseCurrency: c.currency,
            fiscalYearStartMonth: c.fiscalYearStartMonth,
            taxRegistered: c.regime !== 'NONE',
          });
          setAddress({ country: code });
        }}
      />
      <SelectSheet
        visible={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        title={tr('onboarding:country.baseCurrency')}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={draft.baseCurrency}
        onSelect={(v) => set({ baseCurrency: v })}
      />
      <SelectSheet
        visible={fyOpen}
        onClose={() => setFyOpen(false)}
        title={tr('onboarding:country.fyStarts')}
        options={monthNames().map((m, i) => ({ value: String(i + 1), label: m }))}
        value={String(draft.fiscalYearStartMonth)}
        onSelect={(v) => set({ fiscalYearStartMonth: Number(v) })}
        searchable={false}
      />
    </WizardShell>
  );
}
