import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View, ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldGrid, FieldRow, FormContainer, FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { AmountField, focusFirstInvalid, PhoneField, PickerField, Segmented, SwitchField, TextField, usePhoneInput } from '@esmart/ui/components/Field';
import { buysFrom, hasLedger, sellsTo, usualSide, type BalanceSide } from '@esmart/core/domain/partyKinds';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { useServerSave } from '../../components/useServerSave';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { GstRegistrationType, MsmeType, Party, PartyKind } from '@esmart/core/types';
import { TDS_SECTIONS, tdsSection } from '@esmart/core/data/tdsSections';
import { TCS_SECTIONS, tcsSection } from '@esmart/core/data/tcsSections';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { GST_REGISTRATION_LABELS } from '@esmart/core/domain/eInvoice';
import { INDIAN_STATES, WORLD_COUNTRIES, countryName, stateName as stateNameOf } from '@esmart/core/data/masters';
import { OTHER_COUNTRY_CODE } from '@esmart/core/domain/stateCodes';
import { citiesForState } from '@esmart/core/data/cities';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { fromMajor, toMajor, zero } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { nowISO, today } from '@esmart/core/lib/date';
import { Errors, gstinRequiredFor, hasErrors, partyGstinError, required, validEmail, validPostalCode } from '@esmart/core/lib/validators';
import { useAppStore } from '../../store/appStore';
import { useBaseCurrency, useHasModule, useParties } from '../../store/selectors';
import { SHOW_SCROLLBAR, WIDE_FORM_MAX_WIDTH, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../navigation/useGoBack';
import { useGstinLookup, type GstinDetails } from '../gstin/useGstinLookup';
import { CustomFieldsSection, customFieldErrors, useCustomFields } from '../customFields/CustomFieldsSection';
import type { CustomValues } from '@esmart/core/domain/customFields';

const CODE_PREFIX: Record<PartyKind, string> = { customer: 'C', supplier: 'S', both: 'B', general: 'G' };

const TERMS = [0, 7, 15, 21, 30, 45, 60, 90];
const MSME_OPTIONS = ['none', 'micro', 'small', 'medium'] as const;

export function PartyForm({ kind: routeKind, party }: { kind: PartyKind; party?: Party }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['contacts', 'common', 'settings', 'domain', 'purchases', 'books']);
  const router = useRouter();
  const goBack = useGoBack();
  // Added from a document's party picker: back to the document, which picks the new party.
  const { then } = useLocalSearchParams<{ then?: string }>();
  // Where Cancel and Save land when there is no screen to go back to.
  // The route's kind to start with; a new contact can be both or general, and a customer or supplier can become both.
  const [kind, setKind] = useState<PartyKind>(party?.kind ?? routeKind);
  const hasPurchases = useHasModule('purchases');
  const kindOptions: PartyKind[] = !party || party.kind === 'general' ? ['customer', 'supplier', 'both', 'general'] : party.kind === 'both' ? ['both'] : [party.kind, 'both'];
  const allowedKinds = kindOptions.filter((k) => hasPurchases || !buysFrom(k));
  const backTo = party ? `/(app)/contacts/${party.kind === 'supplier' ? 'suppliers' : 'customers'}/${party.id}` : '/(app)/(tabs)/contacts';
  const { run: serverSave, saving, blocked } = useServerSave();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

  const baseCurrency = useBaseCurrency();
  const existing = useParties();
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
  // A party synced from an older API can arrive without an address.
  const billing = party?.billingAddress;
  const [country, setCountry] = useState(billing?.country && billing.country !== 'IN' ? billing.country : '');
  const [region, setRegion] = useState(overseas ? (billing?.state ?? '') : '');
  const [countryOpen, setCountryOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [email, setEmail] = useState(party?.email ?? '');
  const phone = usePhoneInput(party?.phone);
  const [currency, setCurrency] = useState(party?.currency ?? baseCurrency);
  const [terms, setTerms] = useState(party?.paymentTermsDays ?? 30);
  const [creditLimit, setCreditLimit] = useState(party?.creditLimit ? String(toMajor(party.creditLimit)) : '');
  const [openingBalance, setOpeningBalance] = useState(
    party?.openingBalance && party.openingBalance.minor !== 0 ? String(Math.abs(toMajor(party.openingBalance))) : '',
  );
  const [openingDate, setOpeningDate] = useState<string | undefined>(party?.openingBalanceDate);
  const [customFields, setCustomFields] = useState<CustomValues>(party?.customFields ?? {});
  // The company's own fields, checked as the server will (required, numbers, dates, choices); shown once Save is tried.
  const companyFields = useCustomFields('party');
  const customErrors = customFieldErrors(companyFields, 'party', customFields, tr);
  const [customTried, setCustomTried] = useState(false);
  // Dr: they owe us; Cr: we owe them. A negative stored amount (an old advance) reads as the other side.
  const [openingSide, setOpeningSide] = useState<BalanceSide>(() => {
    const side = party?.openingBalanceSide ?? usualSide(party?.kind ?? routeKind);
    return (party?.openingBalance.minor ?? 0) < 0 ? (side === 'dr' ? 'cr' : 'dr') : side;
  });
  const [line1, setLine1] = useState(billing?.line1 ?? '');
  const [city, setCity] = useState(billing?.city ?? '');
  const [stateCode, setStateCode] = useState(billing?.stateCode ?? '');
  const [postalCode, setPostalCode] = useState(billing?.postalCode ?? '');
  const [sameShipping, setSameShipping] = useState(!party?.shippingAddress);
  const [shipLine1, setShipLine1] = useState(party?.shippingAddress?.line1 ?? '');
  const [shipCity, setShipCity] = useState(party?.shippingAddress?.city ?? '');
  const [notes, setNotes] = useState(party?.notes ?? '');
  const [pan, setPan] = useState(party?.pan ?? '');
  const [msmeType, setMsmeType] = useState<MsmeType | undefined>(party?.msmeType);
  const [udyam, setUdyam] = useState(party?.udyamNumber ?? '');
  const [reverseCharge, setReverseCharge] = useState(!!party?.reverseCharge);
  const [msmeOpen, setMsmeOpen] = useState(false);
  const [tdsSectionCode, setTdsSectionCode] = useState(party?.tdsSection);
  const [tdsOpen, setTdsOpen] = useState(false);
  const [tcsApplicable, setTcsApplicable] = useState(!!party?.tcsApplicable);
  const [tcsSectionCode, setTcsSectionCode] = useState(party?.tcsSection);
  const [tcsOpen, setTcsOpen] = useState(false);
  const [certRate, setCertRate] = useState(party?.lowerTdsCertificate ? String(party.lowerTdsCertificate.rate) : '');
  const [certValidTill, setCertValidTill] = useState(party?.lowerTdsCertificate?.validTill ?? '');
  const [active, setActive] = useState((party?.status ?? 'active') === 'active');

  const [stateOpen, setStateOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'taxId' | 'country' | 'postalCode' | 'tcsSection'>>({});

  // Both cities hang off the one state, so a city left over from the old state goes.
  const changeState = (code: string) => {
    setStateCode(code);
    const cities = citiesForState(code);
    if (city && !cities.includes(city)) setCity('');
    if (shipCity && !cities.includes(shipCity)) setShipCity('');
  };

  const nameLabel = kind === 'supplier' ? tr('contacts:form.supplierName') : tr('contacts:form.customerName');
  const termsLabel = (days: number) => (days === 0 ? tr('contacts:form.dueOnReceipt') : tr('contacts:form.termsDays', { count: days }));
  // A GSTIN brings the party's registered name, GST type and address from the GST portal.
  const fillFromPortal = (d: GstinDetails) => {
    const registeredName = d.legalName ?? d.tradeName;
    if (registeredName) setName(registeredName);
    if (d.registrationType && gstinRequiredFor(d.registrationType)) setRegistration(d.registrationType);
    const a = d.address;
    if (!a) return;
    const street = [a.line1, a.line2].filter(Boolean).join(', ');
    if (street) setLine1(street);
    const code = a.stateCode ?? taxId.slice(0, 2);
    if (INDIAN_STATES.some((s) => s.code === code)) changeState(code);
    if (a.city) setCity(a.city);
    if (a.postalCode) setPostalCode(a.postalCode);
  };
  const gstinLookup = useGstinLookup({ gstin: taxId, opened: party?.taxId, enabled: needsGstin, fill: fillFromPortal });

  /**
   * After "Save & add another": a clean form for the next contact, keeping what tends to
   * repeat in a run of them (currency, payment terms, state).
   */
  const resetForAnother = () => {
    setName('');
    setContact('');
    setTaxId('');
    setRegistration('unregistered');
    setCountry('');
    setRegion('');
    setEmail('');
    phone.reset();
    setCreditLimit('');
    setOpeningBalance('');
    setOpeningDate(undefined);
    setLine1('');
    setCity('');
    setPostalCode('');
    setSameShipping(true);
    setShipLine1('');
    setShipCity('');
    setNotes('');
    setPan('');
    setMsmeType(undefined);
    setUdyam('');
    setReverseCharge(false);
    setTdsSectionCode(undefined);
    setTcsApplicable(false);
    setTcsSectionCode(undefined);
    setCertRate('');
    setCertValidTill('');
    setErrors({});
    requestAnimationFrame(() => (globalThis.document?.getElementById('party-form-name') as HTMLElement | null)?.focus());
  };
  // Not when the form was opened to pick a contact (?then=back): that one goes straight back.
  const offersAnother = !party && then !== 'back';

  const save = async (another = false) => {
    const gstin = needsGstin ? taxId.trim().toUpperCase() : '';
    const next: Errors<'name' | 'email' | 'phone' | 'taxId' | 'country' | 'postalCode' | 'tcsSection'> = {
      name: required(name, nameLabel),
      email: validEmail(email),
      phone: phone.error(),
      taxId:
        partyGstinError(registration, gstin) ??
        (gstin && stateCode && gstin.slice(0, 2) !== stateCode
          ? tr('contacts:form.gstinStateMismatch', { state: stateNameOf(gstin.slice(0, 2)) })
          : undefined),
      country: overseas && !country ? tr('contacts:form.countryRequired') : undefined,
      postalCode: validPostalCode(postalCode, overseas ? country : 'IN', overseas ? undefined : stateCode),
      tcsSection: sellsTo(kind) && tcsApplicable && !tcsSectionCode ? tr('contacts:form.tcsSectionRequired') : undefined,
    };
    setErrors(next);
    setCustomTried(true);
    if (hasErrors(next) || Object.keys(customErrors).length) {
      focusFirstInvalid();
      return;
    }

    // An overseas party's place of supply is "other country" (96): exports and imports are inter-state.
    const stateName = overseas ? region.trim() : (INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? '');
    const partyStateCode = overseas ? OTHER_COUNTRY_CODE : stateCode || undefined;
    const partyCountry = overseas ? country : 'IN';
    const nextCode =
      party?.code ??
      `${CODE_PREFIX[kind]}-${String(existing.filter((p) => p.kind === kind).length + 1).padStart(3, '0')}`;

    const record: Party = {
      id: party?.id ?? uid(kind === 'customer' ? 'cus' : 'sup'),
      companyId: party?.companyId ?? activeCompanyId,
      kind,
      name: name.trim(),
      code: nextCode,
      displayName: contact.trim() || undefined,
      taxId: gstin || undefined,
      gstRegistrationType: registration,
      // A GSTIN carries the PAN; the server reads it from there when this is blank.
      pan: overseas ? undefined : pan.trim().toUpperCase() || undefined,
      msmeType: buysFrom(kind) ? msmeType : undefined,
      udyamNumber: buysFrom(kind) && msmeType ? udyam.trim().toUpperCase() || undefined : undefined,
      reverseCharge: buysFrom(kind) && reverseCharge ? true : undefined,
      tdsSection: buysFrom(kind) ? tdsSectionCode : undefined,
      lowerTdsCertificate: buysFrom(kind) && tdsSectionCode && certRate && certValidTill ? { rate: Number(certRate), validTill: certValidTill } : undefined,
      tcsApplicable: sellsTo(kind) && tcsApplicable ? true : undefined,
      tcsSection: sellsTo(kind) && tcsApplicable ? tcsSectionCode : undefined,
      email: email.trim().toLowerCase() || undefined,
      phone: phone.value || undefined,
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
      openingBalance: openingBalance && hasLedger(kind) ? fromMajor(openingBalance, currency) : zero(currency),
      openingBalanceDate: openingBalance && hasLedger(kind) ? openingDate : undefined,
      // Said only when it isn't the kind's usual side, so most records stay as they were.
      openingBalanceSide: openingBalance && hasLedger(kind) && openingSide !== usualSide(kind) ? openingSide : undefined,
      paymentTermsDays: terms,
      customFields,
      notes: notes.trim() || undefined,
      status: active ? 'active' : 'inactive',
      createdAt: party?.createdAt ?? nowISO(),
    };

    const savedMessage =
      kind === 'customer'
        ? tr(party ? 'contacts:form.customerUpdated' : 'contacts:form.customerAdded')
        : tr(party ? 'contacts:form.supplierUpdated' : 'contacts:form.supplierAdded');
    const res = await serverSave(() => saveParty(record), savedMessage, { icon: 'account-check-outline', detail: record.name });
    if (!res) return;
    const id = res.id ?? record.id;
    if (party) goBack(backTo);
    else if (another) resetForAnother();
    else if (then === 'back' && router.canGoBack()) router.back();
    else router.replace(kind === 'supplier' ? `/(app)/contacts/suppliers/${id}` : `/(app)/contacts/customers/${id}`);
  };
  useSaveShortcut(() => void save(), !saving, offersAnother ? () => void save(true) : undefined);

  // Every field is built once and placed twice: stacked in one column on a
  // phone, grouped into cards across two columns on a desktop browser.
  const nameField = <TextField id="party-form-name" label={nameLabel} value={name} onChangeText={setName} placeholder={tr('contacts:form.businessName')} error={errors.name} required icon="domain" />;
  const contactField = <TextField label={tr('contacts:form.contactPerson')} value={contact} onChangeText={setContact} placeholder={tr('contacts:form.contactPlaceholder')} icon="account-outline" />;
  const registrationField = (
    <PickerField
      label={tr('contacts:form.gstRegistration')}
      value={tr(`domain:gstRegistration.${registration}`)}
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
        // A GSTIN is 15 letters and digits; spaces and dashes pasted with it are dropped.
        const next = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
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
      hint={gstinLookup.hint ?? tr('contacts:form.gstinHint')}
      suffix={gstinLookup.suffix}
      required
    />
  ) : null;
  const panField = overseas ? null : (
    <TextField
      label="PAN"
      value={pan}
      onChangeText={(v) => setPan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
      placeholder={/^\d{2}[A-Z]{5}\d{4}[A-Z]/.test(taxId) ? taxId.slice(2, 12) : 'AABCV1234F'}
      autoCapitalize="characters"
      icon="card-text-outline"
      hint={tr('contacts:form.panHint')}
    />
  );
  const supplierTaxFields =
    buysFrom(kind) ? (
      <>
        <PickerField
          label={tr('contacts:form.msme')}
          value={tr(`contacts:form.msmeType.${msmeType ?? 'none'}`)}
          onPress={() => setMsmeOpen(true)}
          icon="factory"
          hint={tr('contacts:form.msmeHint')}
        />
        {msmeType ? (
          <TextField label={tr('contacts:form.udyam')} value={udyam} onChangeText={(v) => setUdyam(v.toUpperCase())} placeholder="UDYAM-TN-02-0012345" autoCapitalize="characters" icon="numeric" />
        ) : null}
        <SwitchField label={tr('contacts:form.reverseCharge')} description={tr('contacts:form.reverseChargeHint')} value={reverseCharge} onValueChange={setReverseCharge} />
        <PickerField
          label={tr('contacts:form.tdsSection')}
          value={tdsSectionCode ? `${tdsSection(tdsSectionCode)?.label} · ${tdsSection(tdsSectionCode)?.nature}` : tr('purchases:tds.none')}
          onPress={() => setTdsOpen(true)}
          icon="bank-minus"
          hint={tr('contacts:form.tdsSectionHint')}
        />
        {tdsSectionCode ? (
          // Side by side on a phone; a desktop's side column is too narrow for a date beside the
          // rate, so there the two stack, each the column's width.
          <View style={desktop ? { gap: t.spacing.lg } : { flexDirection: 'row', gap: t.spacing.md }}>
            <TextField
              label={tr('contacts:form.lowerTdsRate')}
              value={certRate}
              onChangeText={(v) => setCertRate(v.replace(/[^0-9.]/g, ''))}
              placeholder="—"
              keyboardType="decimal-pad"
              hint={tr('contacts:form.lowerTds')}
              containerStyle={desktop ? undefined : { flex: 1 }}
            />
            <View style={desktop ? undefined : { flex: 1 }}>
              <DateField label={tr('contacts:form.lowerTdsValidTill')} value={certValidTill} onChange={setCertValidTill} />
            </View>
          </View>
        ) : null}
      </>
    ) : null;
  // TCS is collected on sales (s.206C), so only from someone the business sells to.
  const customerTaxFields = sellsTo(kind) ? (
    <>
      <SwitchField
        label={tr('contacts:form.tcsApplicable')}
        description={tr('contacts:form.tcsApplicableHint')}
        value={tcsApplicable}
        onValueChange={(on) => {
          setTcsApplicable(on);
          if (on && !tcsSectionCode) setTcsOpen(true);
        }}
      />
      {tcsApplicable ? (
        <PickerField
          label={tr('contacts:form.tcsSection')}
          value={tcsSectionCode ? `${tcsSection(tcsSectionCode)?.label} · ${tcsSection(tcsSectionCode)?.nature}` : undefined}
          placeholder={tr('contacts:form.tcsSectionPick')}
          onPress={() => setTcsOpen(true)}
          icon="bank-plus"
          error={errors.tcsSection}
          required
        />
      ) : null}
    </>
  ) : null;
  const phoneField = <PhoneField label={tr('contacts:form.phone')} {...phone.field} placeholder="98765 43210" error={errors.phone} />;
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
  const termsField = !hasLedger(kind) ? null : <PickerField label={tr('contacts:form.paymentTerms')} value={termsLabel(terms)} onPress={() => setTermsOpen(true)} icon="calendar-clock" />;
  const creditLimitField =
    sellsTo(kind) ? (
      <AmountField label={tr('contacts:form.creditLimit')} value={creditLimit} onChangeValue={setCreditLimit} currency={currency} hint={tr('contacts:form.creditLimitHint')} />
    ) : null;
  const openingBalanceField = !hasLedger(kind) ? null : (
    <>
      <AmountField
        label={tr('contacts:form.openingBalance')}
        value={openingBalance}
        onChangeValue={setOpeningBalance}
        currency={currency}
        hint={kind === 'supplier' ? tr('contacts:form.openingBalanceHintSupplier') : kind === 'both' ? tr('contacts:form.openingBalanceHintBoth') : tr('contacts:form.openingBalanceHintCustomer')}
      />
      {openingBalance ? (
        <Segmented
          options={(['dr', 'cr'] as const).map((s) => ({ value: s, label: tr(`contacts:form.openingSide.${s}`) }))}
          value={openingSide}
          onChange={(v) => setOpeningSide(v as BalanceSide)}
        />
      ) : null}
      {openingBalance ? (
        <SwitchField label={tr('books:accounts.openingOnDate')} description={tr('books:accounts.openingOnDateHint')} value={!!openingDate} onValueChange={(on) => setOpeningDate(on ? today() : undefined)} />
      ) : null}
      {openingBalance && openingDate ? <DateField label={tr('books:accounts.openingDate')} value={openingDate} onChange={setOpeningDate} maximumDate={new Date()} /> : null}
    </>
  );
  const kindField =
    allowedKinds.length > 1 ? (
      <View style={{ gap: t.spacing.xs }}>
        <Segmented options={allowedKinds.map((k) => ({ value: k, label: tr(`contacts:kind.${k}`) }))} value={kind} onChange={(v) => setKind(v as PartyKind)} />
        <Text variant="caption" tone="muted">
          {tr(`contacts:kindHint.${kind}`)}
        </Text>
      </View>
    ) : null;
  const customFieldsBlock = <CustomFieldsSection entity="party" values={customFields} onChange={setCustomFields} errors={customTried ? customErrors : undefined} />;
  const notesField = <TextField label={tr('contacts:form.notes')} value={notes} onChangeText={setNotes} placeholder={tr('contacts:form.notesPlaceholder')} multiline />;
  const activeField = <SwitchField label={tr('contacts:form.active')} description={tr('contacts:form.activeHint')} value={active} onValueChange={setActive} />;

  const submitTitle = party
    ? tr('settings:profile.save')
    : kind === 'customer'
      ? tr('common:quickAction.addCustomer')
      : tr('contacts:form.addSupplier');

  const phoneHeading = (title: string) => (
    <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>{title}</Text>
  );

  const phoneForm = (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      {kindField}
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
      {panField}
      {customerTaxFields}
      {supplierTaxFields}

      {customFieldsBlock}
      {notesField}
      {activeField}
    </ScrollView>
  );

  const details = (
    <FormSection title={tr('contacts:form.businessDetails')}>
      {kindField}
      <FieldRow>
        {nameField}
        {contactField}
      </FieldRow>
      {/* With no GSTIN the registration picker takes the whole row rather than leaving an empty half. */}
      <FieldGrid items={[registrationField, gstinField ?? null]} />
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
      {panField}
      {customerTaxFields}
      {supplierTaxFields}
    </FormSection>
  );
  const status = (
    <FormSection title={tr('contacts:form.notesAndStatus')}>
      {customFieldsBlock}
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
        <View style={{ gap: t.spacing.lg, maxWidth: WIDE_FORM_MAX_WIDTH }}>
          {details}
          {address}
          {trading}
          {status}
        </View>
      ) : (
        <SplitPane
          sideWidth={380}
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Two columns on a desktop: the details and address beside the terms, across the page like the other two-column forms. */}
      <FormContainer wide={desktop} style={desktop ? { maxWidth: '100%' } : undefined}>
        {desktop ? desktopForm : phoneForm}

        <FormActions>
          {desktop ? (
            <>
              <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(backTo)} />
              {offersAnother ? (
                <Button
                  title={tr('common:action.saveAndAddAnother')}
                  tooltip={tr('common:action.saveAndAddAnotherShortcut', { keys: 'Shift+Ctrl+S' })}
                  variant="secondary"
                  onPress={() => void save(true)}
                  loading={saving}
                  disabled={blocked}
                />
              ) : null}
              <Button shortcut="S" title={submitTitle} onPress={() => void save()} loading={saving} disabled={blocked} />
            </>
          ) : (
            <>
              <Button shortcut="S" title={submitTitle} onPress={() => void save()} loading={saving} disabled={blocked} fullWidth />
              {offersAnother ? (
                <Button title={tr('common:action.saveAndAddAnother')} variant="ghost" onPress={() => void save(true)} loading={saving} disabled={blocked} fullWidth />
              ) : null}
            </>
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
          options={(Object.keys(GST_REGISTRATION_LABELS) as GstRegistrationType[]).map((k) => ({ value: k, label: tr(`domain:gstRegistration.${k}`) }))}
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
          visible={tdsOpen}
          onClose={() => setTdsOpen(false)}
          title={tr('contacts:form.tdsSection')}
          options={[{ value: 'none', label: tr('purchases:tds.none') }, ...TDS_SECTIONS.map((x) => ({ value: x.code, label: x.label, description: x.nature }))]}
          value={tdsSectionCode ?? 'none'}
          onSelect={(v) => setTdsSectionCode(v === 'none' ? undefined : v)}
          searchable={false}
        />
        <SelectSheet
          visible={tcsOpen}
          onClose={() => setTcsOpen(false)}
          title={tr('contacts:form.tcsSection')}
          options={TCS_SECTIONS.map((x) => ({ value: x.code, label: x.label, description: x.nature }))}
          value={tcsSectionCode}
          onSelect={(v) => {
            setTcsSectionCode(v);
            setErrors((e) => ({ ...e, tcsSection: undefined }));
          }}
          searchable={false}
        />
        <SelectSheet
          visible={msmeOpen}
          onClose={() => setMsmeOpen(false)}
          title={tr('contacts:form.msme')}
          options={MSME_OPTIONS.map((k) => ({ value: k, label: tr(`contacts:form.msmeType.${k}`) }))}
          value={msmeType ?? 'none'}
          onSelect={(v) => setMsmeType(v === 'none' ? undefined : (v as MsmeType))}
          searchable={false}
        />
        <SelectSheet
          visible={termsOpen}
          onClose={() => setTermsOpen(false)}
          title={tr('contacts:form.paymentTerms')}
          options={TERMS.map((d) => ({ value: String(d), label: termsLabel(d) }))}
          value={String(terms)}
          onSelect={(v) => setTerms(Number(v))}
          searchable={false}
        />
      </FormContainer>
    </KeyboardAvoidingView>
  );
}

