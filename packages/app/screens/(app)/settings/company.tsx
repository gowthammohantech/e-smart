import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
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
import { useActiveCompany } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { profileLocks } from '@esmart/core/domain/companyLock';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { FieldRow } from '@esmart/ui/components/Layout';
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
  const { t: tr } = useTranslation(['nav', 'settings', 'onboarding', 'errors']);
  const months = monthNames();
  const goBack = useGoBack();
  const { run: serverSave, saving, blocked } = useServerSave();
  const toast = useToast();

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
  const [bankRate, setBankRate] = useState(String(company?.msmeBankRate ?? 5.5));
  const [toleranceDays, setToleranceDays] = useState(String(company?.gstr2bDateToleranceDays ?? 3));
  const [tan, setTan] = useState(company?.tan ?? '');
  const bank = company?.bankDetails;
  const [bankName, setBankName] = useState(bank?.bankName ?? '');
  const [accountName, setAccountName] = useState(bank?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(bank?.accountNumber ?? '');
  const [ifsc, setIfsc] = useState(bank?.ifsc ?? '');
  const [bankBranch, setBankBranch] = useState(bank?.branch ?? '');
  const [upiId, setUpiId] = useState(bank?.upiId ?? '');
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
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone' | 'taxId' | 'postalCode' | 'tan' | 'ifsc' | 'accountNumber' | 'upiId' | 'bankRate' | 'toleranceDays'>>({});

  const country = COUNTRIES.find((c) => c.code === company?.country);
  const currency = CURRENCIES.find((c) => c.code === company?.baseCurrency);

  const save = async () => {
    // In the order the fields sit on the page, so the toast names the first one you'd reach.
    const next: Errors<'name' | 'email' | 'phone' | 'taxId' | 'postalCode' | 'tan' | 'ifsc' | 'accountNumber' | 'upiId' | 'bankRate' | 'toleranceDays'> = {
      name: required(name, tr('errors:field.businessName')),
      email: validEmail(email),
      phone: phone.error(),
      postalCode: validPostalCode(postalCode, company?.country, stateCode),
      // The same shapes the server checks, said here in words.
      accountNumber: accountNumber.trim() && !/^(?:[0-9A-Za-z] ?){6,34}$/.test(accountNumber.trim()) ? tr('settings:company.accountNumberInvalid') : undefined,
      ifsc: ifsc.trim() && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim()) ? tr('settings:company.ifscInvalid') : undefined,
      upiId: upiId.trim() && !/^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(upiId.trim()) ? tr('settings:company.upiInvalid') : undefined,
      taxId: taxRegistered && company?.country === 'IN' ? validGstin(taxId) : undefined,
      tan: taxRegistered ? validTan(tan) : undefined,
      // Out of range is said on the field, not quietly swapped for the default.
      bankRate: bankRate.trim() && !(Number(bankRate) >= 0 && Number(bankRate) <= 50) ? tr('settings:company.msmeBankRateInvalid') : undefined,
      toleranceDays: toleranceDays.trim() && !(/^\d{1,2}$/.test(toleranceDays.trim()) && Number(toleranceDays) <= 30) ? tr('settings:company.gstr2bToleranceInvalid') : undefined,
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
        // Typed values out of range fall back to the defaults the server also keeps.
        msmeBankRate: Number(bankRate) >= 0 && Number(bankRate) <= 50 && bankRate.trim() ? Number(bankRate) : 5.5,
        gstr2bDateToleranceDays: /^\d{1,2}$/.test(toleranceDays.trim()) && Number(toleranceDays) <= 30 ? Number(toleranceDays) : 3,
        // Blank clears it; the server takes an empty TAN as "none".
        tan: tan.trim().toUpperCase(),
        // Sent whole: an empty field clears it on the server.
        bankDetails: {
          bankName: bankName.trim(),
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
          ifsc: ifsc.trim().toUpperCase(),
          branch: bankBranch.trim(),
          upiId: upiId.trim(),
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.businessProfile') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {usagePending ? (
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
        ) : null}
        <LogoSection />
        <FieldRow>
          <TextField label={tr('settings:company.name')} value={name} onChangeText={setName} error={errors.name} required icon="domain" />
          <TextField label={tr('settings:company.legalName')} value={legalName} onChangeText={setLegalName} placeholder={tr('settings:company.legalPlaceholder')} editable={!locks.legalName} />
        </FieldRow>
        <PickerField label={tr('settings:company.type')} value={tr(`onboarding:businessType.${businessType}` as 'onboarding:businessType.other')} onPress={() => setTypeOpen(true)} icon="storefront-outline" />

        <FieldRow>
          <TextField label={tr('settings:company.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} />
          <PhoneField label={tr('settings:company.phone')} {...phone.field} error={errors.phone} />
        </FieldRow>
        <TextField label={tr('settings:company.website')} value={website} onChangeText={setWebsite} autoCapitalize="none" icon="web" />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:company.registeredAddress')}</Text>
        <TextField label={tr('settings:company.address')} value={line1} onChangeText={setLine1} icon="map-marker-outline" />
        <PickerField label={tr('settings:company.state')} value={INDIAN_STATES.find((s) => s.code === stateCode)?.name} onPress={() => setStateOpen(true)} icon="map-outline" disabled={locks.state} />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <CityField label={tr('settings:company.city')} value={city} onChange={setCity} stateCode={stateCode} containerStyle={{ flex: 1 }} />
          <TextField label="PIN" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" maxLength={company?.country === 'IN' ? 6 : undefined} error={errors.postalCode} containerStyle={{ flex: 1 }} />
        </View>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }} nativeID="bank-and-signature">
          {tr('settings:company.bankAndSignature')}
        </Text>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18, marginTop: -t.spacing.sm }}>
          {tr('settings:company.bankHint')}
        </Text>
        <TextField label={tr('settings:company.accountName')} value={accountName} onChangeText={setAccountName} icon="account-outline" placeholder={name} />
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <TextField label={tr('settings:company.bankName')} value={bankName} onChangeText={setBankName} icon="bank-outline" containerStyle={{ flex: 1 }} />
          <TextField label={tr('settings:company.branchName')} value={bankBranch} onChangeText={setBankBranch} containerStyle={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <TextField
            label={tr('settings:company.accountNumber')}
            value={accountNumber}
            onChangeText={setAccountNumber}
            keyboardType="number-pad"
            error={errors.accountNumber}
            containerStyle={{ flex: 1 }}
          />
          <TextField
            label={tr('settings:company.ifsc')}
            value={ifsc}
            onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
            autoCapitalize="characters"
            placeholder="HDFC0001234"
            error={errors.ifsc}
            containerStyle={{ flex: 1 }}
          />
        </View>
        <TextField
          label={tr('settings:company.upiId')}
          value={upiId}
          onChangeText={(v) => setUpiId(v.trim())}
          autoCapitalize="none"
          keyboardType="email-address"
          icon="qrcode"
          placeholder={UPI_SAMPLE}
          error={errors.upiId}
        />
        <SignatureSection />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:company.taxAndFy')}</Text>
        <FieldRow>
          <PickerField label={tr('settings:company.country')} value={country?.name} onPress={() => {}} icon="earth" hint={tr('settings:company.countryFixed')} disabled />
          <PickerField label={tr('settings:company.baseCurrency')} value={currency ? `${currency.name} (${currency.code})` : undefined} onPress={() => {}} icon="cash-multiple" disabled />
        </FieldRow>
        <PickerField label={tr('settings:company.fyStarts')} value={months[fyMonth - 1]} onPress={() => setFyOpen(true)} icon="calendar-range" disabled={locks.fiscalYear} />

        <SwitchField
          label={tr('settings:company.registeredFor', { regime: country?.regime === 'VAT' ? 'VAT' : 'GST' })}
          value={taxRegistered}
          onValueChange={setTaxRegistered}
          disabled={locks.registration}
        />
        {taxRegistered ? (
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
                <TextField
                  label={tr('settings:company.tan')}
                  value={tan}
                  onChangeText={(v) => setTan(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                  autoCapitalize="characters"
                  icon="bank-minus"
                  placeholder="MUMA12345B"
                  hint={tr('settings:company.tanHint')}
                  error={errors.tan}
                />
                <TextField
                  label={tr('settings:company.lutNumber')}
                  value={lutNumber}
                  onChangeText={(v) => setLutNumber(v.toUpperCase())}
                  autoCapitalize="characters"
                  icon="earth-arrow-right"
                  placeholder="AD270426012345X"
                  hint={tr('settings:company.lutHint')}
                />
                {lutNumber.trim() ? (
                  <DateField label={tr('settings:company.lutValidTill')} value={lutValidTill} onChange={setLutValidTill} />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:company.inventory')}</Text>
        <SwitchField
          label={tr('settings:company.allowNegativeStock')}
          description={tr('settings:company.allowNegativeStockHint')}
          value={allowNegativeStock}
          onValueChange={setAllowNegativeStock}
        />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:company.rules')}</Text>
        <TextField
          label={tr('settings:company.msmeBankRate')}
          value={bankRate}
          onChangeText={setBankRate}
          keyboardType="decimal-pad"
          hint={tr('settings:company.msmeBankRateHint')}
          error={errors.bankRate}
          icon="percent-outline"
        />
        <TextField
          label={tr('settings:company.gstr2bTolerance')}
          value={toleranceDays}
          onChangeText={setToleranceDays}
          keyboardType="number-pad"
          hint={tr('settings:company.gstr2bToleranceHint')}
          error={errors.toleranceDays}
          icon="calendar-range"
        />

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
      <SelectSheet visible={fyOpen} onClose={() => setFyOpen(false)} title={tr('settings:company.fyStarts')} options={months.map((m, i) => ({ value: String(i + 1), label: m }))} value={String(fyMonth)} onSelect={(v) => setFyMonth(Number(v))} searchable={false} />
    </KeyboardAvoidingView>
  );
}
