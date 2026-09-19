import React, { useState } from 'react';
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CountryStep() {
  const t = useTheme();
  const router = useRouter();
  const { draft, set, setAddress } = useOnboardingStore();

  const [countryOpen, setCountryOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);

  const country = COUNTRIES.find((c) => c.code === draft.country);
  const currency = CURRENCIES.find((c) => c.code === draft.baseCurrency);

  return (
    <WizardShell
      title="Country and currency"
      subtitle="Your country pack decides tax rules, invoice fields and date formats."
      steps={onboardingSteps(draft.plan)}
      currentStep={stepIndex('country', draft.plan)}
      onPrimary={() => router.push(nextStepRoute('country', draft.plan))}
    >
      <PickerField
        label="Country"
        value={country?.name}
        onPress={() => setCountryOpen(true)}
        icon="earth"
        required
      />
      <PickerField
        label="Base currency"
        value={currency ? `${currency.name} (${currency.symbol})` : undefined}
        onPress={() => setCurrencyOpen(true)}
        icon="cash-multiple"
        required
        hint="Every report is presented in this currency. Individual documents can still be raised in another currency."
      />
      <PickerField
        label="Financial year starts"
        value={MONTHS[draft.fiscalYearStartMonth - 1]}
        onPress={() => setFyOpen(true)}
        icon="calendar-range"
      />

      <Card variant="flat" style={{ gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          What you get with {country?.name}
        </Text>
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          {country?.regime === 'GST'
            ? `${country.taxIdLabel} validation, CGST/SGST/IGST split by place of supply, HSN/SAC codes, e-invoice and e-way bill hooks, and ${country.name} invoice formatting.`
            : country?.regime === 'VAT'
              ? `${country.taxIdLabel} capture, VAT-compliant invoice layout and local date/number formatting.`
              : 'A tax-neutral setup you can configure manually under Settings.'}
        </Text>
      </Card>

      <SelectSheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        title="Country"
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
        title="Base currency"
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={draft.baseCurrency}
        onSelect={(v) => set({ baseCurrency: v })}
      />
      <SelectSheet
        visible={fyOpen}
        onClose={() => setFyOpen(false)}
        title="Financial year starts"
        options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
        value={String(draft.fiscalYearStartMonth)}
        onSelect={(v) => set({ fiscalYearStartMonth: Number(v) })}
        searchable={false}
      />
    </WizardShell>
  );
}
