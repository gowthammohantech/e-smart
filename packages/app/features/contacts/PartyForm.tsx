import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldRow, FormContainer, FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { AmountField, PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { useToast } from '@esmart/ui/components/Toast';
import { GstRegistrationType, Party, PartyKind } from '@esmart/core/types';
import { INDIAN_STATES, WORLD_COUNTRIES, countryName, stateName as stateNameOf } from '@esmart/core/data/masters';
import { OTHER_COUNTRY_CODE } from '@esmart/core/domain/stateCodes';
import { citiesForState } from '@esmart/core/data/cities';
import { GST_REGISTRATION_LABELS } from '@esmart/core/domain/eInvoice';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { fromMajor, toMajor, zero } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { nowISO } from '@esmart/core/lib/date';
import { Errors, gstinRequiredFor, hasErrors, partyGstinError, required, validEmail, validPhone, validPostalCode } from '@esmart/core/lib/validators';
import { useAppStore } from '../../store/appStore';
import { useBaseCurrency, useParties } from '../../store/selectors';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';

const TERMS = [0, 7, 15, 21, 30, 45, 60, 90];

export function PartyForm({ kind, party }: { kind: PartyKind; party?: Party }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['contacts', 'common']);
  const router = useRouter();
  const toast = useToast();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

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
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'taxId' | 'country' | 'postalCode'>>({});

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
    const next: Errors<'name' | 'email' | 'phone' | 'taxId' | 'country' | 'postalCode'> = {
      name: required(name, `${label} name`),
      email: validEmail(email),
      phone: validPhone(phone),
      taxId:
        partyGstinError(registration, gstin) ??
        (gstin && stateCode && gstin.slice(0, 2) !== stateCode
          ? `This GSTIN is registered in ${stateNameOf(gstin.slice(0, 2))}, not the state below`
          : undefined),
      country: overseas && !country ? tr('contacts:form.countryRequired') : undefined,
      postalCode: validPostalCode(postalCode, overseas ? country : 'IN'),
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

  // Every field is built once and placed twice: stacked in one column on a
  // phone, grouped into cards across two columns on a desktop browser.
  const nameField = <TextField label={`${label} name`} value={name} onChangeText={setName} placeholder={tr('contacts:form.businessName')} error={errors.name} required icon="domain" />;
  const contactField = <TextField label={tr('contacts:form.contactPerson')} value={contact} onChangeText={setContact} placeholder={tr('contacts:form.contactPlaceholder')} icon="account-outline" />;
  const registrationField = (
    <PickerField
      label={tr('contacts:form.gstRegistration')}
      value={GST_REGISTRATION_LABELS[registration]}
      onPress={() => setRegistrationOpen(true)}
      icon="shield-account-outline"
      hint={tr('contacts:form.sezHint')}
      required
    />
  );
  const gstinField = needsGstin ? (
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
  ) : null;
  const phoneField = <TextField label={tr('contacts:form.phone')} value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" icon="phone-outline" error={errors.phone} />;
  const emailField = <TextField label={tr('contacts:form.email')} value={email} onChangeText={setEmail} placeholder={tr('contacts:form.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} />;

  const addressField = <TextField label={tr('contacts:form.address')} value={line1} onChangeText={setLine1} placeholder={tr('contacts:form.addressPlaceholder')} icon="map-marker-outline" />;
  const countryField = (
    <PickerField
      label={tr('contacts:form.country')}
      value={country ? countryName(country) : undefined}
      onPress={() => setCountryOpen(true)}
      icon="earth"
      error={errors.country}
      hint={tr('contacts:form.overseasHint')}
      required
    />
  );
  const regionField = <TextField label={tr('contacts:form.region')} value={region} onChangeText={setRegion} icon="map-outline" />;
  const stateField = (
    <PickerField
      label={tr('contacts:form.state')}
      value={INDIAN_STATES.find((s) => s.code === stateCode)?.name}
      onPress={() => setStateOpen(true)}
      icon="map-outline"
      hint={tr('contacts:form.stateHint')}
    />
  );
  // City and postal code share a row on a phone too, where each takes half of it.
  const overseasCityField = (style?: ViewStyle) => <TextField label={tr('contacts:form.city')} value={city} onChangeText={setCity} containerStyle={style} />;
  const overseasPostalField = (style?: ViewStyle) => (
    <TextField label={tr('contacts:form.postalCode')} value={postalCode} onChangeText={setPostalCode} autoCapitalize="characters" error={errors.postalCode} containerStyle={style} />
  );
  const cityField = (style?: ViewStyle) => <CityField label={tr('contacts:form.city')} value={city} onChange={setCity} stateCode={stateCode} containerStyle={style} />;
  const pinField = (style?: ViewStyle) => (
    <TextField label="PIN" value={postalCode} onChangeText={(v) => setPostalCode(v.replace(/\D/g, '').slice(0, 6))} placeholder="400001" keyboardType="number-pad" maxLength={6} error={errors.postalCode} containerStyle={style} />
  );
  const sameShippingField = <SwitchField label={tr('contacts:form.sameShipping')} value={sameShipping} onValueChange={setSameShipping} />;
  const shipAddressField = <TextField label={tr('contacts:form.shippingAddress')} value={shipLine1} onChangeText={setShipLine1} placeholder={tr('contacts:form.addressPlaceholder')} icon="truck-outline" />;
  const shipCityField = overseas ? (
    <TextField label={tr('contacts:form.shippingCity')} value={shipCity} onChangeText={setShipCity} />
  ) : (
    <CityField label={tr('contacts:form.shippingCity')} value={shipCity} onChange={setShipCity} stateCode={stateCode} />
  );

  const currencyField = <PickerField label={tr('contacts:form.currency')} value={currency} onPress={() => setCurrencyOpen(true)} icon="cash-multiple" />;
  const termsField = <PickerField label={tr('contacts:form.paymentTerms')} value={terms === 0 ? 'Due on receipt' : `${terms} days`} onPress={() => setTermsOpen(true)} icon="calendar-clock" />;
  const creditLimitField =
    kind === 'customer' ? (
      <AmountField label={tr('contacts:form.creditLimit')} value={creditLimit} onChangeValue={setCreditLimit} currency={currency} hint={tr('contacts:form.creditLimitHint')} />
    ) : null;
  const openingBalanceField = (
    <AmountField
      label={tr('contacts:form.openingBalance')}
      value={openingBalance}
      onChangeValue={setOpeningBalance}
      currency={currency}
      hint={kind === 'customer' ? 'What they already owed you when you started.' : 'What you already owed them when you started.'}
    />
  );
  const notesField = <TextField label={tr('contacts:form.notes')} value={notes} onChangeText={setNotes} placeholder={tr('contacts:form.notesPlaceholder')} multiline />;
  const activeField = <SwitchField label={tr('contacts:form.active')} description={tr('contacts:form.activeHint')} value={active} onValueChange={setActive} />;

  const submitTitle = party ? 'Save changes' : `Add ${label.toLowerCase()}`;

  const phoneHeading = (title: string) => (
    <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>{title}</Text>
  );

  const phoneForm = (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      {nameField}
      {contactField}
      {registrationField}
      {gstinField}
      {phoneField}
      {emailField}

      {phoneHeading(tr('contacts:form.billingAddress'))}
      {addressField}
      {overseas ? (
        <>
          {countryField}
          {regionField}
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {overseasCityField({ flex: 1 })}
            {overseasPostalField({ flex: 1 })}
          </View>
        </>
      ) : (
        <>
          {stateField}
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {cityField({ flex: 1 })}
            {pinField({ flex: 1 })}
          </View>
        </>
      )}

      {sameShippingField}
      {!sameShipping ? (
        <>
          {shipAddressField}
          {shipCityField}
        </>
      ) : null}

      {phoneHeading(tr('contacts:form.tradingTerms'))}
      {currencyField}
      {termsField}
      {creditLimitField}
      {openingBalanceField}

      {notesField}
      {activeField}
    </ScrollView>
  );

  const details = (
    <FormSection title={tr('contacts:form.businessDetails')}>
      <FieldRow>
        {nameField}
        {contactField}
      </FieldRow>
      <FieldRow>
        {registrationField}
        {/* Holds the column when there's no GSTIN, so the picker keeps its width. */}
        {gstinField ?? <View />}
      </FieldRow>
      <FieldRow>
        {phoneField}
        {emailField}
      </FieldRow>
    </FormSection>
  );
  const address = (
    <FormSection title={tr('contacts:form.billingAddress')}>
      {addressField}
      {overseas ? (
        <>
          <FieldRow>
            {countryField}
            {regionField}
          </FieldRow>
          <FieldRow>
            {overseasCityField()}
            {overseasPostalField()}
          </FieldRow>
        </>
      ) : (
        <FieldRow>
          {stateField}
          {cityField()}
          {pinField()}
        </FieldRow>
      )}
      {sameShippingField}
      {!sameShipping ? (
        <FieldRow>
          {shipAddressField}
          {shipCityField}
        </FieldRow>
      ) : null}
    </FormSection>
  );
  const trading = (
    <FormSection title={tr('contacts:form.tradingTerms')}>
      {currencyField}
      {termsField}
      {creditLimitField}
      {openingBalanceField}
    </FormSection>
  );
  const status = (
    <FormSection title={tr('contacts:form.notesAndStatus')}>
      {notesField}
      {activeField}
    </FormSection>
  );

  const desktopForm = (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      {/* A narrow browser window (icon-only sidebar) has no room for the side column. */}
      {breakpoint === 'tablet' ? (
        <View style={{ gap: t.spacing.lg }}>
          {details}
          {address}
          {trading}
          {status}
        </View>
      ) : (
        <SplitPane
          sideWidth={360}
          main={
            <View style={{ gap: t.spacing.lg }}>
              {details}
              {address}
            </View>
          }
          side={
            <>
              {trading}
              {status}
            </>
          }
        />
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer wide={desktop} style={desktop ? { maxWidth: '100%' } : undefined}>
        {desktop ? desktopForm : phoneForm}

        <FormActions>
          {desktop ? (
            <>
              <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => router.back()} />
              <Button title={submitTitle} onPress={save} />
            </>
          ) : (
            <Button title={submitTitle} onPress={save} fullWidth size="lg" />
          )}
        </FormActions>

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
      </FormContainer>
    </KeyboardAvoidingView>
  );
}

