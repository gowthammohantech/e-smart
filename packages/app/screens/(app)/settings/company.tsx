import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { focusFirstInvalid, PhoneField, PickerField, Segmented, SwitchField, TextField, usePhoneInput } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import { useServerSave } from '../../../components/useServerSave';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, usePaymentAccounts } from '../../../store/selectors';
import { bankDetailsOf } from '@esmart/core/domain/paymentAccounts';
import { useCompanyUsage } from '../../../remote/queries';
import { profileLocks } from '@esmart/core/domain/companyLock';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { Columns, FieldGrid, FormSection } from '@esmart/ui/components/Layout';
import { Card } from '@esmart/ui/components/Card';
import { Icon } from '@esmart/ui/components/Icon';
import { BUSINESS_TYPES, COUNTRIES, INDIAN_STATES } from '@esmart/core/data/masters';
import { citiesForState } from '@esmart/core/data/cities';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { monthNames } from '@esmart/core/lib/date';
import { Errors, hasErrors, required, validEmail, validGstin, validPostalCode, validTan } from '@esmart/core/lib/validators';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../../navigation/useGoBack';
import { LogoSection } from '../../../features/company/LogoSection';
import { SignatureSection } from '../../../features/company/SignatureSection';
import { ArchiveSection } from '../../../features/company/ArchiveSection';
import { SkeletonGroup, SkeletonText } from '@esmart/ui/components/Skeleton';


/** A sample UPI ID for the field's placeholder: an address, the same in every language. */
const UPI_SAMPLE = 'business@okhdfc';

/** Keyed by business: on the web the page stays open across a switch, and the form copies the profile once. */
export default function CompanySettings() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <CompanySettingsForm key={companyId} />;
}

function CompanySettingsForm() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings', 'onboarding', 'errors', 'contacts']);
  const months = monthNames();
  const goBack = useGoBack();
  const { run: serverSave, saving, blocked } = useServerSave();
  const toast = useToast();

  // Opened for one part of the profile (`?section=tax|bank`, from Home's setup steps): scroll to it.
  // It follows the section for a moment while what is above it (the lock notice, the logo) settles.
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [openedAt] = useState(() => Date.now());
  const gap = t.spacing.lg;
  const onSectionLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (Date.now() - openedAt < 2500) scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - gap), animated: true });
    },
    [openedAt, gap],
  );
  const anchor = (key: 'tax' | 'bank') => (section === key ? onSectionLayout : undefined);

  const company = useActiveCompany();
  const saveCompany = useAppStore((s) => s.saveCompany);
  // After the first posted entry, the fields those entries depend on are frozen.
  // Locked until the server says otherwise; it refuses the change either way.
  const usageQuery = useCompanyUsage();
  const usage = usageQuery.data;
  const posted = !usage || usage.postedDocuments > 0;
  // Not known yet: the fields stay locked, but the notice waits rather than flashing on a fresh business.
  const usagePending = !usage && !usageQuery.isError;
  const locks = profileLocks(company, posted);

  const [name, setName] = useState(company?.name ?? '');
  const [legalName, setLegalName] = useState(company?.legalName ?? '');
  const [businessType, setBusinessType] = useState(company?.businessType ?? BUSINESS_TYPES[0]);
  const [email, setEmail] = useState(company?.email ?? '');
  const phone = usePhoneInput(company?.phone);
  const [website, setWebsite] = useState(company?.website ?? '');
  const [line1, setLine1] = useState(company?.address?.line1 ?? '');
  const [city, setCity] = useState(company?.address?.city ?? '');
  const [stateCode, setStateCode] = useState(company?.address?.stateCode ?? '');
  const [postalCode, setPostalCode] = useState(company?.address?.postalCode ?? '');
  const [taxRegistered, setTaxRegistered] = useState(!!company?.taxRegistration?.registered);
  const [taxId, setTaxId] = useState(company?.taxRegistration?.identifier ?? '');
  const [composition, setComposition] = useState(!!company?.taxRegistration?.compositionScheme);
  const [returnFrequency, setReturnFrequency] = useState(company?.taxRegistration?.returnFrequency ?? 'monthly');
  const [fyMonth, setFyMonth] = useState(company?.fiscalYearStartMonth ?? 4);
  const [allowNegativeStock, setAllowNegativeStock] = useState(!!company?.allowNegativeStock);
  const [tan, setTan] = useState(company?.tan ?? '');
  const bank = company?.bankDetails;
  const [bankName, setBankName] = useState(bank?.bankName ?? '');
  const [accountName, setAccountName] = useState(bank?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(bank?.accountNumber ?? '');
  const [ifsc, setIfsc] = useState(bank?.ifsc ?? '');
  const [bankBranch, setBankBranch] = useState(bank?.branch ?? '');
  const [upiId, setUpiId] = useState(bank?.upiId ?? '');
  // The bank account in the books these details belong to: receipts default to it.
  const bankAccounts = usePaymentAccounts().filter((a) => a.type === 'bank');
  const [bookAccountId, setBookAccountId] = useState(bank?.paymentAccountId ?? '');
  const [bookAccountOpen, setBookAccountOpen] = useState(false);
  const bookAccount = bankAccounts.find((a) => a.id === bookAccountId);
  // Linked, the invoices print that account's own details (the server copies them); the fields below
  // are only for a business that hasn't linked one.
  const linkedDetails = bookAccount ? bankDetailsOf(bookAccount) : undefined;
  const router = useRouter();
  const [lutNumber, setLutNumber] = useState(company?.taxRegistration?.lutNumber ?? '');
  // An LUT is filed per financial year, so it runs to the next 31 March by default.
  const [lutValidTill, setLutValidTill] = useState(() => {
    if (company?.taxRegistration?.lutValidTill) return company.taxRegistration.lutValidTill;
    const now = new Date();
    return `${now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear()}-03-31`;
  });

  const [typeOpen, setTypeOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'taxId' | 'postalCode' | 'tan' | 'ifsc' | 'accountNumber' | 'upiId'>>({});

  const country = COUNTRIES.find((c) => c.code === company?.country);
  const currency = CURRENCIES.find((c) => c.code === company?.baseCurrency);

  const save = async () => {
    // In the order the fields sit on the page, so the toast names the first one you'd reach.
    const next: Errors<'name' | 'email' | 'phone' | 'taxId' | 'postalCode' | 'tan' | 'ifsc' | 'accountNumber' | 'upiId'> = {
      name: required(name, tr('errors:field.businessName')),
      email: validEmail(email),
      phone: phone.error(),
      postalCode: validPostalCode(postalCode, company?.country, stateCode),
      // The same shapes the server checks, said here in words.
      accountNumber: !bookAccount && accountNumber.trim() && !/^(?:[0-9A-Za-z] ?){6,34}$/.test(accountNumber.trim()) ? tr('settings:company.accountNumberInvalid') : undefined,
      ifsc: !bookAccount && ifsc.trim() && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim()) ? tr('settings:company.ifscInvalid') : undefined,
      upiId: !bookAccount && upiId.trim() && !/^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(upiId.trim()) ? tr('settings:company.upiInvalid') : undefined,
      taxId: taxRegistered && company?.country === 'IN' ? validGstin(taxId) : undefined,
      tan: taxRegistered ? validTan(tan) : undefined,
      // Out of range is said on the field, not quietly swapped for the default.
    };
    setErrors(next);
    if (hasErrors(next)) {
      // The page is long: the field may be out of sight, so say what's wrong and go to it.
      const first = Object.values(next).find(Boolean);
      if (first) toast.show(first, 'error');
      focusFirstInvalid();
      return;
    }
    if (!company) return;

    const res = await serverSave(() =>
      saveCompany({
        ...company,
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        businessType,
        email: email.trim() || undefined,
        phone: phone.value || undefined,
        website: website.trim() || undefined,
        fiscalYearStartMonth: fyMonth,
        allowNegativeStock,
        // Blank clears it; the server takes an empty TAN as "none".
        tan: tan.trim().toUpperCase(),
        // Linked: the account's own details, which the server copies too. Otherwise sent whole: an
        // empty field clears it on the server, and an account deleted since it was linked reads as unlinked.
        bankDetails: bookAccount
          ? { ...linkedDetails, paymentAccountId: bookAccount.id }
          : {
              bankName: bankName.trim(),
              accountName: accountName.trim(),
              accountNumber: accountNumber.trim(),
              ifsc: ifsc.trim().toUpperCase(),
              branch: bankBranch.trim(),
              upiId: upiId.trim(),
              paymentAccountId: '',
            },
        address: {
          ...company.address,
          line1: line1.trim(),
          city: city.trim(),
          state: INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? company.address?.state ?? '',
          stateCode: stateCode || undefined,
          postalCode: postalCode.trim(),
          country: company.address?.country || company.country,
        },
        taxRegistration: {
          regime: country?.regime ?? 'NONE',
          identifier: taxId.trim().toUpperCase() || undefined,
          identifierLabel: country?.taxIdLabel ?? tr('onboarding:done.defaultTaxLabel'),
          registered: taxRegistered,
          compositionScheme: composition,
          placeOfSupplyStateCode: stateCode || company.taxRegistration?.placeOfSupplyStateCode,
          lutNumber: taxRegistered && lutNumber.trim() ? lutNumber.trim().toUpperCase() : undefined,
          lutValidTill: taxRegistered && lutNumber.trim() && lutValidTill ? lutValidTill : undefined,
          returnFrequency,
        },
      }),
      tr('settings:company.saved'),
      { icon: 'store-check-outline' },
    );
    if (!res) return;
    goBack('/(app)/(tabs)/more');
  };
  useSaveShortcut(() => void save(), !saving);

  // Built once and placed per layout: desktop section cards or the phone's single column.
  const half = desktop ? undefined : { flex: 1 };
  const stateField = (
    <PickerField label={tr('settings:company.state')} value={INDIAN_STATES.find((s) => s.code === stateCode)?.name} onPress={() => setStateOpen(true)} icon="map-outline" disabled={locks.state} />
  );
  const cityField = <CityField label={tr('settings:company.city')} value={city} onChange={setCity} stateCode={stateCode} containerStyle={half} />;
  const pinField = (
    <TextField label="PIN" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" maxLength={company?.country === 'IN' ? 6 : undefined} error={errors.postalCode} containerStyle={half} />
  );
  const accountNameField = <TextField key="accName" label={tr('settings:company.accountName')} value={accountName} onChangeText={setAccountName} icon="account-outline" placeholder={name} />;
  const bankNameField = <TextField key="bank" label={tr('settings:company.bankName')} value={bankName} onChangeText={setBankName} icon="bank-outline" containerStyle={half} />;
  const branchField = <TextField key="branch" label={tr('settings:company.branchName')} value={bankBranch} onChangeText={setBankBranch} containerStyle={half} />;
  const accountNumberField = (
    <TextField key="accNo" label={tr('settings:company.accountNumber')} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" error={errors.accountNumber} containerStyle={half} />
  );
  const ifscField = (
    <TextField
      key="ifsc"
      label={tr('settings:company.ifsc')}
      value={ifsc}
      onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
      autoCapitalize="characters"
      placeholder="HDFC0001234"
      error={errors.ifsc}
      containerStyle={half}
    />
  );
  const upiField = (
    <TextField
      key="upi"
      label={tr('settings:company.upiId')}
      value={upiId}
      onChangeText={(v) => setUpiId(v.trim())}
      autoCapitalize="none"
      keyboardType="email-address"
      icon="qrcode"
      placeholder={UPI_SAMPLE}
      error={errors.upiId}
    />
  );

  const bookAccountField = (
    <View key="bookAccount" style={{ gap: t.spacing.xs }}>
      <PickerField
        label={tr('settings:company.bookAccount')}
        value={bookAccount ? `${bookAccount.name}${bookAccount.accountNumber ? ` · •••• ${bookAccount.accountNumber.slice(-4)}` : ''}` : tr('settings:company.bookAccountNone')}
        onPress={() => setBookAccountOpen(true)}
        icon="bank-transfer-in"
        hint={bankAccounts.length ? tr('settings:company.bookAccountHint') : tr('settings:company.bookAccountEmpty')}
        disabled={!bankAccounts.length}
      />
    </View>
  );
  // Linked: what the invoices print, from the account; changed in Payment accounts.
  const linkedCard = bookAccount ? (
    <Card key="linked" variant="flat" style={{ gap: t.spacing.xs }}>
      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
        {tr('settings:company.bookAccountPrints', { name: bookAccount.name })}
      </Text>
      {[
        [tr('settings:company.accountName'), linkedDetails?.accountName || company?.legalName || company?.name],
        [tr('settings:company.bankName'), [linkedDetails?.bankName, linkedDetails?.branch].filter(Boolean).join(' · ')],
        [tr('settings:company.accountNumber'), linkedDetails?.accountNumber],
        [tr('settings:company.ifsc'), linkedDetails?.ifsc],
        [tr('settings:company.upiId'), linkedDetails?.upiId],
      ]
        .filter(([, v]) => !!v)
        .map(([label, v]) => (
          <View key={label} style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Text variant="caption" tone="muted" style={{ width: 130 }}>
              {label}
            </Text>
            <Text variant="small" weight="600" style={{ flex: 1 }} selectable>
              {v}
            </Text>
          </View>
        ))}
      {linkedDetails?.accountNumber || linkedDetails?.upiId ? null : (
        <Text variant="caption" tone="warn" style={{ lineHeight: 18 }}>
          {tr('settings:company.bookAccountIncomplete', { name: bookAccount.name })}
        </Text>
      )}
      <Button
        title={tr('settings:company.bookAccountEdit')}
        icon="pencil-outline"
        variant="ghost"
        size="sm"
        onPress={() => router.push('/(app)/settings/accounts' as never)}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  ) : null;

  const caption = (label: string, nativeID?: string) => (
    <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }} nativeID={nativeID}>
      {label}
    </Text>
  );
  const notice = usagePending ? (
    <Card variant="flat">
      <SkeletonGroup>
        <SkeletonText lines={2} />
      </SkeletonGroup>
    </Card>
  ) : posted ? (
    <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
      <Icon name="lock-outline" size={19} color={t.c.muted} />
      <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
        {tr('settings:company.lockedNotice')}
      </Text>
    </Card>
  ) : null;
  const nameField = <TextField key="name" label={tr('settings:company.name')} value={name} onChangeText={setName} error={errors.name} required icon="domain" />;
  const legalNameField = (
    <TextField key="legal" label={tr('settings:company.legalName')} value={legalName} onChangeText={setLegalName} placeholder={tr('settings:company.legalPlaceholder')} editable={!locks.legalName} />
  );
  const emailField = (
    <TextField key="email" label={tr('settings:company.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} />
  );
  const phoneField = <PhoneField key="phone" label={tr('settings:company.phone')} {...phone.field} error={errors.phone} />;
  const typeField = (
    <PickerField key="type" label={tr('settings:company.type')} value={tr(`onboarding:businessType.${businessType}` as 'onboarding:businessType.other')} onPress={() => setTypeOpen(true)} icon="storefront-outline" />
  );
  const websiteField = <TextField key="web" label={tr('settings:company.website')} value={website} onChangeText={setWebsite} autoCapitalize="none" icon="web" />;
  const addressField = <TextField label={tr('settings:company.address')} value={line1} onChangeText={setLine1} icon="map-marker-outline" />;
  const bankHint = (
    <Text variant="caption" tone="muted" style={{ lineHeight: 18, marginTop: desktop ? undefined : -t.spacing.sm }}>
      {tr('settings:company.bankHint')}
    </Text>
  );
  const countryField = (
    <PickerField key="country" label={tr('settings:company.country')} value={country?.name} onPress={() => {}} icon="earth" hint={tr('settings:company.countryFixed')} disabled />
  );
  const currencyField = (
    <PickerField key="currency" label={tr('settings:company.baseCurrency')} value={currency ? `${currency.name} (${currency.code})` : undefined} onPress={() => {}} icon="cash-multiple" disabled />
  );
  const fyField = <PickerField key="fy" label={tr('settings:company.fyStarts')} value={months[fyMonth - 1]} onPress={() => setFyOpen(true)} icon="calendar-range" disabled={locks.fiscalYear} />;
  const registeredSwitch = (
    <SwitchField
      label={tr('settings:company.registeredFor', { regime: country?.regime === 'VAT' ? 'VAT' : 'GST' })}
      value={taxRegistered}
      onValueChange={setTaxRegistered}
      disabled={locks.registration}
    />
  );
  const tanField = (
    <TextField
      key="tan"
      label={tr('settings:company.tan')}
      value={tan}
      onChangeText={(v) => setTan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
      autoCapitalize="characters"
      icon="bank-minus"
      placeholder="MUMA12345B"
      hint={tr('settings:company.tanHint')}
      error={errors.tan}
    />
  );
  const lutField = (
    <TextField
      key="lut"
      label={tr('settings:company.lutNumber')}
      value={lutNumber}
      onChangeText={(v) => setLutNumber(v.toUpperCase())}
      autoCapitalize="characters"
      icon="earth-arrow-right"
      placeholder="AD270426012345X"
      hint={tr('settings:company.lutHint')}
    />
  );
  const lutDateField = lutNumber.trim() ? <DateField key="lutDate" label={tr('settings:company.lutValidTill')} value={lutValidTill} onChange={setLutValidTill} /> : null;
  // Registration details, shown once the business is registered.
  const taxDetails = taxRegistered ? (
    <>
      <TextField
        label={country?.taxIdLabel ?? tr('onboarding:tax.numberLabel')}
        value={taxId}
        onChangeText={(v) => setTaxId(v.toUpperCase())}
        autoCapitalize="characters"
        icon="card-account-details-outline"
        error={errors.taxId}
        editable={!locks.taxIdentity}
      />
      <SwitchField
        label={tr('settings:company.composition')}
        description={tr('settings:company.compositionHint')}
        value={composition}
        onValueChange={setComposition}
        disabled={locks.taxIdentity}
      />
      {country?.regime === 'GST' ? (
        <>
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="small" tone="muted">
              {tr('settings:company.returnFrequency')}
            </Text>
            <Segmented
              options={[
                { value: 'monthly', label: tr('settings:company.returnMonthly') },
                { value: 'qrmp', label: tr('settings:company.returnQuarterly') },
              ]}
              value={returnFrequency}
              onChange={(v) => setReturnFrequency(v as 'monthly' | 'qrmp')}
            />
            <Text variant="micro" tone="muted">
              {tr('settings:company.returnFrequencyHint')}
            </Text>
          </View>
          {/* Short codes and a date side by side on a desktop; the date shows only with an LUT. */}
          <FieldGrid items={[tanField, lutField, lutDateField]} />
        </>
      ) : null}
    </>
  ) : null;
  const negativeStockSwitch = (
    <SwitchField
      label={tr('settings:company.allowNegativeStock')}
      description={tr('settings:company.allowNegativeStockHint')}
      value={allowNegativeStock}
      onValueChange={setAllowNegativeStock}
    />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.businessProfile') }} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {notice}
        {desktop ? (
          // A desktop uses the page's width: sections as cards, two side by side where they pair up.
          <>
            <Columns
              ratio={[3, 2]}
              left={
                <FormSection title={tr('contacts:form.businessDetails')}>
                  <LogoSection />
                  <FieldGrid items={[nameField, legalNameField, emailField, phoneField, typeField, websiteField]} />
                </FormSection>
              }
              right={
                <View style={{ gap: t.spacing.lg }}>
                  <FormSection title={tr('settings:company.registeredAddress')}>
                    {addressField}
                    <FieldGrid items={[stateField, cityField, pinField]} />
                  </FormSection>
                  <FormSection title={tr('settings:company.inventory')}>{negativeStockSwitch}</FormSection>
                </View>
              }
            />
            <View nativeID="bank-and-signature" onLayout={anchor('bank')}>
              <FormSection title={tr('settings:company.bankAndSignature')}>
                {bankHint}
                {bookAccount ? (
                  <FieldGrid columns={3} items={[bookAccountField]} />
                ) : (
                  <FieldGrid columns={3} items={[bookAccountField, accountNameField, upiField, bankNameField, branchField, accountNumberField, ifscField]} />
                )}
                {linkedCard}
                <SignatureSection />
              </FormSection>
            </View>
            <View onLayout={anchor('tax')}>
              <FormSection title={tr('settings:company.taxAndFy')}>
                <FieldGrid items={[countryField, currencyField, fyField]} />
                {registeredSwitch}
                {taxDetails}
              </FormSection>
            </View>
          </>
        ) : (
          <>
            <LogoSection />
            {nameField}
            {legalNameField}
            {emailField}
            {phoneField}
            {typeField}
            {websiteField}

            {caption(tr('settings:company.registeredAddress'))}
            {addressField}
            {/* A phone keeps state above city and PIN. */}
            {stateField}
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              {cityField}
              {pinField}
            </View>

            <View onLayout={anchor('bank')}>{caption(tr('settings:company.bankAndSignature'), 'bank-and-signature')}</View>
            {bankHint}
            {bookAccountField}
            {bookAccount ? (
              linkedCard
            ) : (
              <>
                {accountNameField}
                <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                  {bankNameField}
                  {branchField}
                </View>
                <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                  {accountNumberField}
                  {ifscField}
                </View>
                {upiField}
              </>
            )}
            <SignatureSection />

            <View onLayout={anchor('tax')}>{caption(tr('settings:company.taxAndFy'))}</View>
            {countryField}
            {currencyField}
            {fyField}
            {registeredSwitch}
            {taxDetails}

            {caption(tr('settings:company.inventory'))}
            {negativeStockSwitch}

          </>
        )}

        {/* Archiving is its own action, kept apart from the form and its Save. */}
        <View style={{ height: 1, backgroundColor: t.c.line, marginTop: t.spacing.xl }} />
        <ArchiveSection />
      </ScrollView>

      <FormActions>
        <Button shortcut="S" title={tr('settings:company.save')} onPress={() => void save()} loading={saving} disabled={blocked} fullWidth={!desktop} size={desktop ? undefined : 'lg'} />
      </FormActions>

      <SelectSheet visible={typeOpen} onClose={() => setTypeOpen(false)} title={tr('settings:company.type')} options={BUSINESS_TYPES.map((b) => ({ value: b, label: tr(`onboarding:businessType.${b}` as 'onboarding:businessType.other') }))} value={businessType} onSelect={setBusinessType} />
      <SelectSheet
        visible={stateOpen}
        onClose={() => setStateOpen(false)}
        title={tr('settings:company.state')}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={stateCode}
        onSelect={(code) => {
          setStateCode(code);
          if (city && !citiesForState(code).includes(city)) setCity('');
        }}
      />
      <SelectSheet
        visible={bookAccountOpen}
        onClose={() => setBookAccountOpen(false)}
        title={tr('settings:company.bookAccount')}
        options={[{ value: '', label: tr('settings:company.bookAccountNone') }, ...bankAccounts.map((a) => ({ value: a.id, label: a.name, trailing: a.accountNumber ? `•••• ${a.accountNumber.slice(-4)}` : undefined }))]}
        value={bookAccountId}
        onSelect={setBookAccountId}
        searchable={false}
      />
      <SelectSheet visible={fyOpen} onClose={() => setFyOpen(false)} title={tr('settings:company.fyStarts')} options={months.map((m, i) => ({ value: String(i + 1), label: m }))} value={String(fyMonth)} onSelect={(v) => setFyMonth(Number(v))} searchable={false} />
    </KeyboardAvoidingView>
  );
}
