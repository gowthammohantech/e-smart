import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { SectionHeader } from '@/components/Screen';
import { PickerField, Segmented, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import {
  BusinessDocument,
  EwayPlace,
  EwaySubSupplyType,
  TransportMode,
  VehicleType,
} from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useComplianceSettings, useTransporters } from '@/store/selectors';
import {
  EWAY_SUB_SUPPLY_TYPES,
  subSupplyTypeFor,
  validUptoFor,
  validityDays,
  normalizeVehicleNumber,
} from '@/domain/ewayBill';
import { mainHsnCodeOf } from '@/domain/eInvoice';
import { INDIAN_STATES, stateName } from '@/data/masters';
import { formatDate, nowISO } from '@/lib/date';
import { formatMoney } from '@/lib/format';

/**
 * Raising an e-way bill (FRD 16).
 *
 * Part-A comes off the document and is shown read-only; Part-B is what the
 * user actually has to supply. The validity preview recomputes on every
 * keystroke, which is the clearest way to show the one-day-per-200-km rule
 * doing its work.
 */
export function EwayBillForm({ document: doc }: { document: BusinessDocument }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const company = useActiveCompany();
  const settings = useComplianceSettings();

  const parties = useAppStore((s) => s.parties);
  const branches = useAppStore((s) => s.branches);
  const generateEwayBill = useAppStore((s) => s.generateEwayBill);

  const buyer = parties.find((p) => p.id === doc.partyId);
  const branch = branches.find((b) => b.id === doc.branchId);
  const shipTo = buyer?.shippingAddress ?? buyer?.billingAddress;

  const [subSupplyType, setSubSupplyType] = useState<EwaySubSupplyType>(subSupplyTypeFor(doc.kind));
  const [subSupplyDescription, setSubSupplyDescription] = useState('');
  const [subSupplyOpen, setSubSupplyOpen] = useState(false);

  const [from, setFrom] = useState<EwayPlace>({
    legalName: company.legalName ?? company.name,
    gstin: company.taxRegistration?.identifier ?? 'URP',
    address1: branch?.address.line1 ?? company.address.line1,
    address2: branch?.address.line2 ?? company.address.line2,
    place: branch?.address.city ?? company.address.city,
    pincode: branch?.address.postalCode ?? company.address.postalCode,
    stateCode: branch?.address.stateCode ?? company.address.stateCode ?? '',
  });
  const [to, setTo] = useState<EwayPlace>({
    legalName: buyer?.name ?? '',
    gstin: buyer?.taxId ?? 'URP',
    address1: shipTo?.line1 ?? '',
    address2: shipTo?.line2,
    place: shipTo?.city ?? '',
    pincode: shipTo?.postalCode ?? '',
    stateCode: shipTo?.stateCode ?? '',
  });
  const [stateSheet, setStateSheet] = useState<'from' | 'to' | null>(null);

  const [transporterId, setTransporterId] = useState(settings.defaultTransporterId ?? '');
  const [transporterName, setTransporterName] = useState(settings.defaultTransporterName ?? '');
  const transporters = useTransporters({ activeOnly: true });
  const [transporterOpen, setTransporterOpen] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>(settings.defaultTransportMode);
  const [vehicleType, setVehicleType] = useState<VehicleType>(settings.defaultVehicleType);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transportDocNumber, setTransportDocNumber] = useState('');
  const [transportDocDate, setTransportDocDate] = useState(doc.date);
  const [distanceKm, setDistanceKm] = useState(String(settings.defaultDistanceKm));

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const distance = Number(distanceKm) || 0;
  const preview = useMemo(() => {
    const days = validityDays(distance, vehicleType);
    return { days, validUpto: validUptoFor(nowISO(), distance, vehicleType) };
  }, [distance, vehicleType]);

  const byRoad = transportMode === 'road';

  const submit = () => {
    setBusy(true);
    const outcome = generateEwayBill({
      documentId: doc.id,
      subSupplyType,
      subSupplyDescription: subSupplyDescription.trim() || undefined,
      transactionType: 1,
      from,
      to,
      transporterId: transporterId.trim() || undefined,
      transporterName: transporterName.trim() || undefined,
      transportMode,
      vehicleNumber: byRoad ? vehicleNumber.trim().toUpperCase() : undefined,
      vehicleType,
      transportDocNumber: byRoad ? undefined : transportDocNumber.trim() || undefined,
      transportDocDate: byRoad ? undefined : transportDocDate,
      distanceKm: distance,
    });
    setBusy(false);

    if (outcome.ok && outcome.ewayBillId) {
      toast.show('E-way bill generated', 'success');
      router.replace(`/(app)/compliance/eway/${outcome.ewayBillId}`);
      return;
    }

    const next: Record<string, string> = {};
    outcome.issues
      .filter((i) => i.severity === 'blocking')
      .forEach((i) => {
        next[i.field] = i.message;
      });
    setErrors(next);
    toast.show(outcome.issues[0]?.message ?? 'The bill could not be raised', 'error');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------- Part-A ---------------- */}
        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600">
            Consignment
          </Text>
          <Row label="Document" value={doc.number} />
          <Row label="Dated" value={formatDate(doc.date)} />
          <Row label="Value" value={formatMoney(doc.totals.grandTotal)} />
          <Row label="Lines" value={String(doc.lines.length)} />
          <Row label="Main HSN" value={mainHsnCodeOf(doc) ?? '—'} />
        </Card>

        <View style={{ height: t.spacing.md }} />

        <PickerField
          label="Sub-supply type"
          value={EWAY_SUB_SUPPLY_TYPES[subSupplyType].label}
          onPress={() => setSubSupplyOpen(true)}
          icon="tag-outline"
        />
        {subSupplyType === 'others' ? (
          <TextField
            label="Describe the sub-supply"
            required
            value={subSupplyDescription}
            onChangeText={setSubSupplyDescription}
            error={errors.subSupplyDescription}
            placeholder="What is moving, and why"
          />
        ) : null}

        <SectionHeader title="From" />
        <PlaceFields
          place={from}
          onChange={setFrom}
          errors={errors}
          prefix="from"
          onPickState={() => setStateSheet('from')}
        />

        <SectionHeader title="To" />
        <PlaceFields
          place={to}
          onChange={setTo}
          errors={errors}
          prefix="to"
          onPickState={() => setStateSheet('to')}
        />

        {/* ---------------- Part-B ---------------- */}
        <SectionHeader title="Transport" />

        {transporters.length ? (
          <PickerField
            label="Saved transporter"
            value={transporters.find((x) => x.transporterId === transporterId.trim().toUpperCase())?.name}
            placeholder="Pick one, or type the details below"
            onPress={() => setTransporterOpen(true)}
            icon="truck-outline"
          />
        ) : null}
        <TextField
          label="Transporter ID"
          value={transporterId}
          onChangeText={setTransporterId}
          autoCapitalize="characters"
          error={errors.transporterId}
          placeholder="15-character GSTIN or TRANSIN"
        />
        <TextField label="Transporter name" value={transporterName} onChangeText={setTransporterName} />

        <View style={{ gap: t.spacing.sm, marginBottom: t.spacing.md }}>
          <Text variant="caption" tone="muted" weight="600">
            Mode
          </Text>
          <Segmented
            options={[
              { value: 'road', label: 'Road' },
              { value: 'rail', label: 'Rail' },
              { value: 'air', label: 'Air' },
              { value: 'ship', label: 'Ship' },
            ]}
            value={transportMode}
            onChange={setTransportMode}
          />
        </View>

        <View style={{ gap: t.spacing.sm, marginBottom: t.spacing.md }}>
          <Text variant="caption" tone="muted" weight="600">
            Cargo
          </Text>
          <Segmented
            options={[
              { value: 'regular', label: 'Regular' },
              { value: 'overDimensional', label: 'Over-dimensional' },
            ]}
            value={vehicleType}
            onChange={setVehicleType}
          />
        </View>

        {byRoad ? (
          <TextField
            label="Vehicle number"
            required
            value={vehicleNumber}
            onChangeText={(v) => setVehicleNumber(normalizeVehicleNumber(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            error={errors.vehicleNumber}
            placeholder="MH12AB1234"
          />
        ) : (
          <>
            <TextField
              label="Transport document number"
              required
              value={transportDocNumber}
              onChangeText={setTransportDocNumber}
              error={errors.transportDocNumber}
              placeholder="Railway receipt, airway bill or bill of lading"
            />
            <DateField
              label="Transport document date"
              required
              value={transportDocDate}
              onChange={setTransportDocDate}
              error={errors.transportDocDate}
            />
          </>
        )}

        <TextField
          label="Approximate distance"
          required
          value={distanceKm}
          onChangeText={setDistanceKm}
          keyboardType="number-pad"
          suffix="km"
          error={errors.distanceKm}
        />

        {/* The rule, made visible. */}
        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
          <MaterialCommunityIcons name="clock-outline" size={20} color={t.c.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="small" weight="600">
              {preview.days} {preview.days === 1 ? 'day' : 'days'} · valid to{' '}
              {formatDate(preview.validUpto.slice(0, 10))}
            </Text>
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              {vehicleType === 'overDimensional'
                ? 'Over-dimensional cargo gets one day per 20 km, or part thereof.'
                : 'One day per 200 km, or part thereof.'}{' '}
              Validity always runs to midnight.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button
          title="Generate e-way bill"
          icon="truck-fast-outline"
          loading={busy}
          onPress={submit}
          fullWidth
        />
      </View>

      <SelectSheet
        visible={subSupplyOpen}
        onClose={() => setSubSupplyOpen(false)}
        title="Sub-supply type"
        options={(Object.keys(EWAY_SUB_SUPPLY_TYPES) as EwaySubSupplyType[]).map((key) => ({
          value: key,
          label: EWAY_SUB_SUPPLY_TYPES[key].label,
        }))}
        value={subSupplyType}
        onSelect={(v) => {
          setSubSupplyType(v as EwaySubSupplyType);
          setSubSupplyOpen(false);
        }}
        searchable={false}
      />

      <SelectSheet
        visible={transporterOpen}
        onClose={() => setTransporterOpen(false)}
        title="Transporter"
        options={transporters.map((x) => ({ value: x.id, label: x.name, trailing: x.transporterId }))}
        value={transporters.find((x) => x.transporterId === transporterId.trim().toUpperCase())?.id}
        onSelect={(id) => {
          const picked = transporters.find((x) => x.id === id);
          if (picked) {
            setTransporterId(picked.transporterId);
            setTransporterName(picked.name);
          }
          setTransporterOpen(false);
        }}
      />
      <SelectSheet
        visible={stateSheet !== null}
        onClose={() => setStateSheet(null)}
        title={stateSheet === 'from' ? 'Despatch state' : 'Delivery state'}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code }))}
        value={stateSheet === 'from' ? from.stateCode : to.stateCode}
        onSelect={(code) => {
          if (stateSheet === 'from') setFrom({ ...from, stateCode: code });
          else setTo({ ...to, stateCode: code });
          setStateSheet(null);
        }}
      />
    </View>
  );
}

function PlaceFields({
  place,
  onChange,
  errors,
  prefix,
  onPickState,
}: {
  place: EwayPlace;
  onChange: (p: EwayPlace) => void;
  errors: Record<string, string>;
  prefix: 'from' | 'to';
  onPickState: () => void;
}) {
  return (
    <>
      <TextField
        label="Legal name"
        value={place.legalName}
        onChangeText={(v) => onChange({ ...place, legalName: v })}
        error={errors[`${prefix}.legalName`]}
      />
      <TextField
        label="GSTIN"
        value={place.gstin}
        onChangeText={(v) => onChange({ ...place, gstin: v.toUpperCase() })}
        autoCapitalize="characters"
        autoCorrect={false}
        error={errors[`${prefix}.gstin`]}
        hint="URP if the party is not registered"
      />
      <TextField
        label="Address"
        value={place.address1}
        onChangeText={(v) => onChange({ ...place, address1: v })}
        error={errors[`${prefix}.address1`]}
      />
      <TextField
        label="Place"
        value={place.place}
        onChangeText={(v) => onChange({ ...place, place: v })}
        error={errors[`${prefix}.place`]}
      />
      <TextField
        label="PIN code"
        value={place.pincode}
        onChangeText={(v) => onChange({ ...place, pincode: v })}
        keyboardType="number-pad"
        maxLength={6}
        error={errors[`${prefix}.pincode`]}
      />
      <PickerField
        label="State"
        value={place.stateCode ? stateName(place.stateCode) : undefined}
        placeholder="Choose a state"
        onPress={onPickState}
        icon="map-marker-outline"
        error={errors[`${prefix}.stateCode`]}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="small">{value}</Text>
    </View>
  );
}
