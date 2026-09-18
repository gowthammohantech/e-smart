import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { PickerField, SwitchField, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany } from '@/store/selectors';
import { TurnoverSlab } from '@/types';
import { GST_STATE_CODES } from '@/domain/gst/stateCodes';
import { formatGstin, isValidGstin, panOfGstin, stateCodeOfGstin } from '@/domain/gst/gstin';
import { EINVOICE_TURNOVER_SLABS } from '@/domain/gst/applicability';
import { Errors, hasErrors, validGstin } from '@/lib/validators';

const SLABS: { value: TurnoverSlab; label: string }[] = [
  { value: 'under5cr', label: 'Under ₹5 crore' },
  { value: '5crTo10cr', label: '₹5 crore to ₹10 crore' },
  { value: '10crTo50cr', label: '₹10 crore to ₹50 crore' },
  { value: 'over50cr', label: 'Over ₹50 crore' },
];

export default function GstSettings() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const company = useActiveCompany();
  const saveCompany = useAppStore((s) => s.saveCompany);
  const reg = company.taxRegistration;

  const [registered, setRegistered] = useState(!!reg?.registered);
  const [gstin, setGstin] = useState(reg?.identifier ?? '');
  const [homeState, setHomeState] = useState(reg?.placeOfSupplyStateCode ?? company.address.stateCode ?? '');
  const [composition, setComposition] = useState(!!reg?.compositionScheme);
  const [slab, setSlab] = useState<TurnoverSlab>(reg?.turnoverSlab ?? 'under5cr');
  const [eInvoice, setEInvoice] = useState(reg?.eInvoiceEnabled ?? true);
  const [eWayBill, setEWayBill] = useState(reg?.eWayBillEnabled ?? true);

  const [stateOpen, setStateOpen] = useState(false);
  const [slabOpen, setSlabOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'gstin'>>({});

  const valid = isValidGstin(gstin);
  const mandatory = EINVOICE_TURNOVER_SLABS.includes(slab);

  const save = () => {
    const next: Errors<'gstin'> = { gstin: registered ? validGstin(gstin) : undefined };
    setErrors(next);
    if (hasErrors(next)) return;

    saveCompany({
      ...company,
      taxRegistration: {
        regime: registered ? 'GST' : 'NONE',
        identifier: gstin.trim().toUpperCase() || undefined,
        identifierLabel: 'GSTIN',
        registered,
        compositionScheme: composition,
        placeOfSupplyStateCode: homeState || undefined,
        turnoverSlab: slab,
        eInvoiceEnabled: eInvoice,
        eWayBillEnabled: eWayBill,
      },
    });
    toast.show('GST settings saved', 'success');
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'GST settings' }} />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SwitchField
          label="Registered under GST"
          description="Unregistered businesses cannot charge GST or issue a tax invoice."
          value={registered}
          onValueChange={setRegistered}
        />

        {registered ? (
          <>
            <TextField
              label="GSTIN"
              value={gstin}
              onChangeText={(v) => setGstin(v.toUpperCase())}
              placeholder="27AAPFU0939F1ZV"
              autoCapitalize="characters"
              icon="card-account-details-outline"
              error={errors.gstin}
              hint="Fifteen characters. The check digit is verified here, not at the portal."
            />

            {valid ? (
              <Card variant="flat" style={{ gap: 4 }}>
                <Text variant="caption" tone="muted" weight="600">
                  {formatGstin(gstin)}
                </Text>
                <Text variant="caption" tone="muted">
                  State {stateCodeOfGstin(gstin)} · PAN {panOfGstin(gstin)}
                </Text>
              </Card>
            ) : null}

            <PickerField
              label="Home state"
              value={GST_STATE_CODES.find((s) => s.code === homeState)?.name}
              onPress={() => setStateOpen(true)}
              icon="map-outline"
              hint="A supply to any other state attracts IGST instead of CGST + SGST."
            />

            <PickerField
              label="Annual aggregate turnover"
              value={SLABS.find((s) => s.value === slab)?.label}
              onPress={() => setSlabOpen(true)}
              icon="chart-line"
              hint={
                mandatory
                  ? 'e-Invoicing is mandatory at this turnover.'
                  : 'e-Invoicing becomes mandatory from ₹5 crore.'
              }
            />

            <SwitchField
              label="Composition scheme"
              description="A composition dealer charges no GST and does not issue e-invoices."
              value={composition}
              onValueChange={setComposition}
            />

            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.sm }}>
              Portals
            </Text>

            <SwitchField
              label="e-Invoicing (IRP)"
              description="Register invoices and credit notes, and receive an IRN with a signed QR."
              value={eInvoice}
              onValueChange={setEInvoice}
            />
            <SwitchField
              label="E-way bills (NIC)"
              description="Generate e-way bills for goods consignments over ₹50,000."
              value={eWayBill}
              onValueChange={setEWayBill}
            />

            <Card variant="flat" style={{ gap: t.spacing.sm }}>
              <Text variant="caption" weight="700" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                About these portals
              </Text>
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                Both run locally in this prototype. The schema, the validation rules, the IRN hash, the 24-hour
                cancellation window and the one-day-per-200-km validity are all real implementations — but nothing
                leaves the device, and the QR is signed with a demo key rather than the portal&apos;s.
              </Text>
            </Card>
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

      <SelectSheet
        visible={stateOpen}
        onClose={() => setStateOpen(false)}
        title="Home state"
        options={GST_STATE_CODES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={homeState}
        onSelect={(v) => {
          setHomeState(v);
          setStateOpen(false);
        }}
      />
      <SelectSheet
        visible={slabOpen}
        onClose={() => setSlabOpen(false)}
        title="Annual aggregate turnover"
        searchable={false}
        options={SLABS.map((s) => ({ value: s.value, label: s.label }))}
        value={slab}
        onSelect={(v) => {
          setSlab(v as TurnoverSlab);
          setSlabOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}
