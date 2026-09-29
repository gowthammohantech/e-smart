import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { AmountField, PickerField, SwitchField, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { CityField } from '@/components/pickers/CityField';
import { useToast } from '@/components/Toast';
import { GstRegistrationType, Party, PartyKind } from '@/types';
import { INDIAN_STATES, WORLD_COUNTRIES, countryName, stateName as stateNameOf } from '@/data/masters';
import { OTHER_COUNTRY_CODE } from '@/domain/stateCodes';
import { citiesForState } from '@/data/cities';
import { GST_REGISTRATION_LABELS } from '@/domain/eInvoice';
import { CURRENCIES } from '@/lib/currencies';
import { fromMajor, toMajor, zero } from '@/lib/money';
import { uid } from '@/lib/id';
import { nowISO } from '@/lib/date';
import { Errors, gstinRequiredFor, hasErrors, partyGstinError, required, validEmail, validPhone } from '@/lib/validators';
import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, useParties } from '@/store/selectors';

const TERMS = [0, 7, 15, 21, 30, 45, 60, 90];

export function PartyForm({ kind, party }: { kind: PartyKind; party?: Party }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['contacts']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const baseCurrency = useBaseCurrency();
  const existing = useParties(kind);
  const saveParty = useAppStore((s) => s.saveParty);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [name, setName] = useState(party?.name ?? '');
  const [contact, setContact] = useState(party?.displayName ?? '');
  const [taxId, setTaxId] = useState(party?.taxId ?? '');
  // GST type comes first; it decides whether a GSTIN is asked for at all.
  const [registration, setRegistration] = useState<GstRegistrationType>(
    party?.gstRegistrationType ?? (party?.taxId ? 'regular' : 'unregistered'),
  );
  const overseas = registration === 'overseas';
  const needsGstin = gstinRequiredFor(registration);
  const [country, setCountry] = useState(
    party?.billingAddress.country && party.billingAddress.country !== 'IN' ? party.billingAddress.country : '',
  );
  const [region, setRegion] = useState(overseas ? (party?.billingAddress.state ?? '') : '');
  const [countryOpen, setCountryOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [email, setEmail] = useState(party?.email ?? '');
  const [phone, setPhone] = useState(party?.phone ?? '');
  const [currency, setCurrency] = useState(party?.currency ?? baseCurrency);
  const [terms, setTerms] = useState(party?.paymentTermsDays ?? 30);
  const [creditLimit, setCreditLimit] = useState(party?.creditLimit ? String(toMajor(party.creditLimit)) : '');
  const [openingBalance, setOpeningBalance] = useState(
    party?.openingBalance && party.openingBalance.minor !== 0 ? String(toMajor(party.openingBalance)) : '',
  );
  const [line1, setLine1] = useState(party?.billingAddress.line1 ?? '');
  const [city, setCity] = useState(party?.billingAddress.city ?? '');
  const [stateCode, setStateCode] = useState(party?.billingAddress.stateCode ?? '');
  const [postalCode, setPostalCode] = useState(party?.billingAddress.postalCode ?? '');
  const [sameShipping, setSameShipping] = useState(!party?.shippingAddress);
  const [shipLine1, setShipLine1] = useState(party?.shippingAddress?.line1 ?? '');
  const [shipCity, setShipCity] = useState(party?.shippingAddress?.city ?? '');
  const [notes, setNotes] = useState(party?.notes ?? '');
  const [active, setActive] = useState((party?.status ?? 'active') === 'active');

  const [stateOpen, setStateOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'taxId' | 'country'>>({});

  // Both cities hang off the one state, so a city left over from the old state goes.
  const changeState = (code: string) => {
    setStateCode(code);
    const cities = citiesForState(code);
    if (city && !cities.includes(city)) setCity('');
    if (shipCity && !cities.includes(shipCity)) setShipCity('');
  };

  const label = kind === 'customer' ? 'Customer' : 'Supplier';

  const save = () => {
    const gstin = needsGstin ? taxId.trim().toUpperCase() : '';
    const next: Errors<'name' | 'email' | 'phone' | 'taxId' | 'country'> = {
      name: required(name, `${label} name`),
      email: validEmail(email),
      phone: validPhone(phone),
      taxId:
        partyGstinError(registration, gstin) ??
        (gstin && stateCode && gstin.slice(0, 2) !== stateCode
          ? `This GSTIN is registered in ${stateNameOf(gstin.slice(0, 2))}, not the state below`
          : undefined),
      country: overseas && !country ? tr('contacts:form.countryRequired') : undefined,
    };
    setErrors(next);
    if (hasErrors(next)) return;

    // An overseas party's place of supply is "other country" (96): exports and imports are inter-state.
    const stateName = overseas ? region.trim() : (INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? '');
    const partyStateCode = overseas ? OTHER_COUNTRY_CODE : stateCode || undefined;
    const partyCountry = overseas ? country : 'IN';
    const nextCode =
      party?.code ??
      `${kind === 'customer' ? 'C' : 'S'}-${String(existing.length + 1).padStart(3, '0')}`;

    const record: Party = {
      id: party?.id ?? uid(kind === 'customer' ? 'cus' : 'sup'),
      companyId: party?.companyId ?? activeCompanyId,
      kind,
      name: name.trim(),
      code: nextCode,
      displayName: contact.trim() || undefined,
      taxId: gstin || undefined,
      gstRegistrationType: registration,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      currency,
      billingAddress: {
        line1: line1.trim(),
        city: city.trim(),
        state: stateName,
        stateCode: partyStateCode,
        postalCode: postalCode.trim(),
        country: partyCountry,
      },
      shippingAddress: sameShipping
        ? undefined
        : {
            line1: shipLine1.trim(),
            city: shipCity.trim(),
            state: stateName,
            stateCode: partyStateCode,
            postalCode: postalCode.trim(),
            country: partyCountry,
          },
      creditLimit: creditLimit ? fromMajor(creditLimit, currency) : undefined,
      openingBalance: openingBalance ? fromMajor(openingBalance, currency) : zero(currency),
      paymentTermsDays: terms,
      notes: notes.trim() || undefined,
      status: active ? 'active' : 'inactive',
      createdAt: party?.createdAt ?? nowISO(),
    };

    saveParty(record);
    toast.show(party ? `${label} updated` : `${label} added`, 'success');
    if (party) router.back();
    else router.replace(kind === 'customer' ? `/(app)/contacts/customers/${record.id}` : `/(app)/contacts/suppliers/${record.id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextField label={`${label} name`} value={name} onChangeText={setName} placeholder={tr('contacts:form.businessName')} error={errors.name} required icon="domain" />
        <TextField label={tr('contacts:form.contactPerson')} value={contact} onChangeText={setContact} placeholder={tr('contacts:form.contactPlaceholder')} icon="account-outline" />
        <PickerField
          label={tr('contacts:form.gstRegistration')}
          value={GST_REGISTRATION_LABELS[registration]}
          onPress={() => setRegistrationOpen(true)}
          icon="shield-account-outline"
          hint={tr('contacts:form.sezHint')}
          required
        />
        {needsGstin ? (
          <TextField
            label="GSTIN"
            value={taxId}
            onChangeText={(v) => {
              const next = v.toUpperCase();
              setTaxId(next);
              // The first two digits are the state; fill it in if it's still blank.
              if (!stateCode && /^\d{2}/.test(next) && INDIAN_STATES.some((s) => s.code === next.slice(0, 2))) {
                changeState(next.slice(0, 2));
              }
            }}
            placeholder="27AABCV1234F1ZO"
            autoCapitalize="characters"
            icon="card-account-details-outline"
            error={errors.taxId}
            hint={tr('contacts:form.gstinHint')}
            required
          />
        ) : null}
        <TextField label={tr('contacts:form.phone')} value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" icon="phone-outline" error={errors.phone} />
        <TextField label={tr('contacts:form.email')} value={email} onChangeText={setEmail} placeholder={tr('contacts:form.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>{tr('contacts:form.billingAddress')}</Text>
        <TextField label={tr('contacts:form.address')} value={line1} onChangeText={setLine1} placeholder={tr('contacts:form.addressPlaceholder')} icon="map-marker-outline" />
        {overseas ? (
          <>
            <PickerField
              label={tr('contacts:form.country')}
              value={country ? countryName(country) : undefined}
              onPress={() => setCountryOpen(true)}
              icon="earth"
              error={errors.country}
              hint={tr('contacts:form.overseasHint')}
              required
            />
            <TextField label={tr('contacts:form.region')} value={region} onChangeText={setRegion} icon="map-outline" />
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <TextField label={tr('contacts:form.city')} value={city} onChangeText={setCity} containerStyle={{ flex: 1 }} />
              <TextField label={tr('contacts:form.postalCode')} value={postalCode} onChangeText={setPostalCode} autoCapitalize="characters" containerStyle={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <PickerField
              label={tr('contacts:form.state')}
              value={INDIAN_STATES.find((s) => s.code === stateCode)?.name}
              onPress={() => setStateOpen(true)}
              icon="map-outline"
              hint={tr('contacts:form.stateHint')}
            />
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <CityField label={tr('contacts:form.city')} value={city} onChange={setCity} stateCode={stateCode} containerStyle={{ flex: 1 }} />
              <TextField label="PIN" value={postalCode} onChangeText={setPostalCode} placeholder="400001" keyboardType="number-pad" containerStyle={{ flex: 1 }} />
            </View>
          </>
        )}

        <SwitchField label={tr('contacts:form.sameShipping')} value={sameShipping} onValueChange={setSameShipping} />
        {!sameShipping ? (
          <>
            <TextField label={tr('contacts:form.shippingAddress')} value={shipLine1} onChangeText={setShipLine1} placeholder={tr('contacts:form.addressPlaceholder')} icon="truck-outline" />
            {overseas ? (
              <TextField label={tr('contacts:form.shippingCity')} value={shipCity} onChangeText={setShipCity} />
            ) : (
              <CityField label={tr('contacts:form.shippingCity')} value={shipCity} onChange={setShipCity} stateCode={stateCode} />
            )}
          </>
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>{tr('contacts:form.tradingTerms')}</Text>
        <PickerField label={tr('contacts:form.currency')} value={currency} onPress={() => setCurrencyOpen(true)} icon="cash-multiple" />
        <PickerField label={tr('contacts:form.paymentTerms')} value={terms === 0 ? 'Due on receipt' : `${terms} days`} onPress={() => setTermsOpen(true)} icon="calendar-clock" />
        {kind === 'customer' ? (
          <AmountField label={tr('contacts:form.creditLimit')} value={creditLimit} onChangeValue={setCreditLimit} currency={currency} hint={tr('contacts:form.creditLimitHint')} />
        ) : null}
        <AmountField
          label={tr('contacts:form.openingBalance')}
          value={openingBalance}
          onChangeValue={setOpeningBalance}
          currency={currency}
          hint={kind === 'customer' ? 'What they already owed you when you started.' : 'What you already owed them when you started.'}
        />

        <TextField label={tr('contacts:form.notes')} value={notes} onChangeText={setNotes} placeholder={tr('contacts:form.notesPlaceholder')} multiline />
        <SwitchField label={tr('contacts:form.active')} description={tr('contacts:form.activeHint')} value={active} onValueChange={setActive} />
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
        <Button title={party ? 'Save changes' : `Add ${label.toLowerCase()}`} onPress={save} fullWidth size="lg" />
      </View>

      <SelectSheet
        visible={stateOpen}
        onClose={() => setStateOpen(false)}
        title={tr('contacts:form.state')}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={stateCode}
        onSelect={changeState}
      />
      <SelectSheet
        visible={registrationOpen}
        onClose={() => setRegistrationOpen(false)}
        title={tr('contacts:form.gstRegistration')}
        options={(Object.keys(GST_REGISTRATION_LABELS) as GstRegistrationType[]).map((k) => ({ value: k, label: GST_REGISTRATION_LABELS[k] }))}
        value={registration}
        onSelect={(v) => {
          const type = v as GstRegistrationType;
          setRegistration(type);
          setErrors((e) => ({ ...e, taxId: undefined }));
          // An Indian state does not apply abroad, and an overseas party has no GSTIN.
          if (type === 'overseas') {
            setStateCode('');
            setTaxId('');
          } else if (!gstinRequiredFor(type)) {
            setTaxId('');
          }
        }}
        searchable={false}
      />
      <SelectSheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        title={tr('contacts:form.country')}
        options={WORLD_COUNTRIES.filter((c) => c.code !== 'IN').map((c) => ({ value: c.code, label: c.name, trailing: c.currency }))}
        value={country}
        onSelect={(code) => {
          setCountry(code);
          setErrors((e) => ({ ...e, country: undefined }));
          // Trade with that country usually runs in its currency, when the app carries it.
          const cur = WORLD_COUNTRIES.find((c) => c.code === code)?.currency;
          if (currency === baseCurrency && cur && CURRENCIES.some((c) => c.code === cur)) setCurrency(cur);
        }}
      />
      <SelectSheet
        visible={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        title={tr('contacts:form.currency')}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={currency}
        onSelect={setCurrency}
      />
      <SelectSheet
        visible={termsOpen}
        onClose={() => setTermsOpen(false)}
        title={tr('contacts:form.paymentTerms')}
        options={TERMS.map((d) => ({ value: String(d), label: d === 0 ? 'Due on receipt' : `${d} days` }))}
        value={String(terms)}
        onSelect={(v) => setTerms(Number(v))}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
