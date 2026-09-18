import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { PickerField, SwitchField, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany } from '@/store/selectors';
import { BUSINESS_TYPES, COUNTRIES, INDIAN_STATES } from '@/data/masters';
import { CURRENCIES } from '@/lib/currencies';
import { Errors, hasErrors, required, validEmail, validGstin } from '@/lib/validators';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CompanySettings() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const company = useActiveCompany();
  const saveCompany = useAppStore((s) => s.saveCompany);

  const [name, setName] = useState(company?.name ?? '');
  const [legalName, setLegalName] = useState(company?.legalName ?? '');
  const [businessType, setBusinessType] = useState(company?.businessType ?? BUSINESS_TYPES[0]);
  const [email, setEmail] = useState(company?.email ?? '');
  const [phone, setPhone] = useState(company?.phone ?? '');
  const [website, setWebsite] = useState(company?.website ?? '');
  const [line1, setLine1] = useState(company?.address.line1 ?? '');
  const [city, setCity] = useState(company?.address.city ?? '');
  const [stateCode, setStateCode] = useState(company?.address.stateCode ?? '');
  const [postalCode, setPostalCode] = useState(company?.address.postalCode ?? '');
  const [taxRegistered, setTaxRegistered] = useState(!!company?.taxRegistration?.registered);
  const [taxId, setTaxId] = useState(company?.taxRegistration?.identifier ?? '');
  const [composition, setComposition] = useState(!!company?.taxRegistration?.compositionScheme);
  const [fyMonth, setFyMonth] = useState(company?.fiscalYearStartMonth ?? 4);

  const [typeOpen, setTypeOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'taxId'>>({});

  const country = COUNTRIES.find((c) => c.code === company?.country);
  const currency = CURRENCIES.find((c) => c.code === company?.baseCurrency);

  const save = () => {
    const next: Errors<'name' | 'email' | 'taxId'> = {
      name: required(name, 'Business name'),
      email: validEmail(email),
      taxId: taxRegistered && company?.country === 'IN' ? validGstin(taxId) : undefined,
    };
    setErrors(next);
    if (hasErrors(next) || !company) return;

    saveCompany({
      ...company,
      name: name.trim(),
      legalName: legalName.trim() || undefined,
      businessType,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      fiscalYearStartMonth: fyMonth,
      address: {
        ...company.address,
        line1: line1.trim(),
        city: city.trim(),
        state: INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? company.address.state,
        stateCode: stateCode || undefined,
        postalCode: postalCode.trim(),
      },
      taxRegistration: {
        regime: country?.regime ?? 'NONE',
        identifier: taxId.trim().toUpperCase() || undefined,
        identifierLabel: country?.taxIdLabel ?? 'Tax number',
        registered: taxRegistered,
        compositionScheme: composition,
        placeOfSupplyStateCode: stateCode || company.taxRegistration?.placeOfSupplyStateCode,
      },
    });
    toast.show('Business profile updated', 'success');
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Business profile' }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextField label="Business name" value={name} onChangeText={setName} error={errors.name} required icon="domain" />
        <TextField label="Legal name" value={legalName} onChangeText={setLegalName} placeholder="As registered" />
        <PickerField label="Business type" value={businessType} onPress={() => setTypeOpen(true)} icon="storefront-outline" />

        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} />
        <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="phone-outline" />
        <TextField label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" icon="web" />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Registered address
        </Text>
        <TextField label="Address" value={line1} onChangeText={setLine1} icon="map-marker-outline" />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <TextField label="City" value={city} onChangeText={setCity} containerStyle={{ flex: 1 }} />
          <TextField label="PIN" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
        </View>
        <PickerField label="State" value={INDIAN_STATES.find((s) => s.code === stateCode)?.name} onPress={() => setStateOpen(true)} icon="map-outline" />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Tax and fiscal year
        </Text>
        <PickerField label="Country" value={country?.name} onPress={() => {}} icon="earth" hint="Country and base currency are fixed once a business has transactions." />
        <PickerField label="Base currency" value={currency ? `${currency.name} (${currency.code})` : undefined} onPress={() => {}} icon="cash-multiple" />
        <PickerField label="Financial year starts" value={MONTHS[fyMonth - 1]} onPress={() => setFyOpen(true)} icon="calendar-range" />

        <SwitchField label={`Registered for ${country?.regime === 'VAT' ? 'VAT' : 'GST'}`} value={taxRegistered} onValueChange={setTaxRegistered} />
        {taxRegistered ? (
          <>
            <TextField
              label={country?.taxIdLabel ?? 'Tax number'}
              value={taxId}
              onChangeText={(v) => setTaxId(v.toUpperCase())}
              autoCapitalize="characters"
              icon="card-account-details-outline"
              error={errors.taxId}
            />
            <SwitchField
              label="Composition scheme"
              description="Invoices are raised without a tax breakdown."
              value={composition}
              onValueChange={setComposition}
            />
          </>
        ) : null}
      </ScrollView>

      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title="Save changes" onPress={save} fullWidth size="lg" />
      </View>

      <SelectSheet visible={typeOpen} onClose={() => setTypeOpen(false)} title="Business type" options={BUSINESS_TYPES.map((b) => ({ value: b, label: b }))} value={businessType} onSelect={setBusinessType} />
      <SelectSheet visible={stateOpen} onClose={() => setStateOpen(false)} title="State" options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))} value={stateCode} onSelect={setStateCode} />
      <SelectSheet visible={fyOpen} onClose={() => setFyOpen(false)} title="Financial year starts" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} value={String(fyMonth)} onSelect={(v) => setFyMonth(Number(v))} searchable={false} />
    </KeyboardAvoidingView>
  );
}
