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
import { useToast } from '@/components/Toast';
import { GstRegistrationType, Party, PartyKind } from '@/types';
import { INDIAN_STATES, stateName as stateNameOf } from '@/data/masters';
import { GST_REGISTRATION_LABELS } from '@/domain/eInvoice';
import { CURRENCIES } from '@/lib/currencies';
import { fromMajor, toMajor, zero } from '@/lib/money';
import { uid } from '@/lib/id';
import { nowISO } from '@/lib/date';
import { Errors, hasErrors, required, validEmail, validGstin, validPhone } from '@/lib/validators';
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
  const [registration, setRegistration] = useState<GstRegistrationType | undefined>(party?.gstRegistrationType);
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
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'taxId'>>({});

  const label = kind === 'customer' ? 'Customer' : 'Supplier';

  const save = () => {
    const next: Errors<'name' | 'email' | 'phone' | 'taxId'> = {
      name: required(name, `${label} name`),
      email: validEmail(email),
      phone: validPhone(phone),
      taxId: taxId
        ? validGstin(taxId) ??
          (stateCode && taxId.trim().toUpperCase().slice(0, 2) !== stateCode
            ? `This GSTIN is registered in ${stateNameOf(taxId.trim().slice(0, 2))}, not the state below`
            : undefined)
        : undefined,
    };
    setErrors(next);
    if (hasErrors(next)) return;

    const stateName = INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? '';
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
      taxId: taxId.trim().toUpperCase() || undefined,
      gstRegistrationType: kind === 'customer' ? registration : party?.gstRegistrationType,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      currency,
      billingAddress: {
        line1: line1.trim(),
        city: city.trim(),
        state: stateName,
        stateCode: stateCode || undefined,
        postalCode: postalCode.trim(),
        country: 'IN',
      },
      shippingAddress: sameShipping
        ? undefined
        : {
            line1: shipLine1.trim(),
            city: shipCity.trim(),
            state: stateName,
            stateCode: stateCode || undefined,
            postalCode: postalCode.trim(),
            country: 'IN',
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
        <TextField
          label="GSTIN"
          value={taxId}
          onChangeText={(v) => {
            const next = v.toUpperCase();
            setTaxId(next);
            // The first two digits are the state; fill it in if it's still blank.
            if (!stateCode && /^\d{2}/.test(next) && INDIAN_STATES.some((s) => s.code === next.slice(0, 2))) {
              setStateCode(next.slice(0, 2));
            }
          }}
          placeholder="27AABCV1234F1ZO"
          autoCapitalize="characters"
          icon="card-account-details-outline"
          error={errors.taxId}
          hint={tr('contacts:form.gstinHint')}
        />
        {kind === 'customer' ? (
          <PickerField
            label={tr('contacts:form.gstRegistration')}
            value={GST_REGISTRATION_LABELS[registration ?? (taxId ? 'regular' : 'unregistered')]}
            onPress={() => setRegistrationOpen(true)}
            icon="shield-account-outline"
            hint={tr('contacts:form.sezHint')}
          />
        ) : null}
        <TextField label={tr('contacts:form.phone')} value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" icon="phone-outline" error={errors.phone} />
        <TextField label={tr('contacts:form.email')} value={email} onChangeText={setEmail} placeholder={tr('contacts:form.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>{tr('contacts:form.billingAddress')}</Text>
        <TextField label={tr('contacts:form.address')} value={line1} onChangeText={setLine1} placeholder={tr('contacts:form.addressPlaceholder')} icon="map-marker-outline" />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <TextField label={tr('contacts:form.city')} value={city} onChangeText={setCity} placeholder={tr('contacts:form.city')} containerStyle={{ flex: 1 }} />
          <TextField label="PIN" value={postalCode} onChangeText={setPostalCode} placeholder="400001" keyboardType="number-pad" containerStyle={{ flex: 1 }} />
        </View>
        <PickerField
          label={tr('contacts:form.state')}
          value={INDIAN_STATES.find((s) => s.code === stateCode)?.name}
          onPress={() => setStateOpen(true)}
          icon="map-outline"
          hint={tr('contacts:form.stateHint')}
        />

        <SwitchField label={tr('contacts:form.sameShipping')} value={sameShipping} onValueChange={setSameShipping} />
        {!sameShipping ? (
          <>
            <TextField label={tr('contacts:form.shippingAddress')} value={shipLine1} onChangeText={setShipLine1} placeholder={tr('contacts:form.addressPlaceholder')} icon="truck-outline" />
            <TextField label={tr('contacts:form.shippingCity')} value={shipCity} onChangeText={setShipCity} placeholder={tr('contacts:form.city')} />
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
        onSelect={setStateCode}
      />
      <SelectSheet
        visible={registrationOpen}
        onClose={() => setRegistrationOpen(false)}
        title={tr('contacts:form.gstRegistration')}
        options={(Object.keys(GST_REGISTRATION_LABELS) as GstRegistrationType[]).map((k) => ({ value: k, label: GST_REGISTRATION_LABELS[k] }))}
        value={registration ?? (taxId ? 'regular' : 'unregistered')}
        onSelect={(v) => setRegistration(v as GstRegistrationType)}
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
