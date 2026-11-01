import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { FieldRow, FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { usePageAction } from '@esmart/ui/components/PageHeader';
import { PickerField, Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { CityField } from '@esmart/ui/components/pickers/CityField';
import type { BusinessDocument, EwayPlace } from '@esmart/core/types';
import { EWAY_SUB_SUPPLY_TYPES, normalizeVehicleNumber } from '@esmart/core/domain/ewayBill';
import { mainHsnCodeOf } from '@esmart/core/domain/eInvoice';
import { stateName } from '@esmart/core/data/masters';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { useDocument, useParties } from '@esmart/app/store/selectors';
import { EwayBillFormSheets, useEwayBillForm, type EwayBillFormState } from '@esmart/app/features/compliance/EwayBillForm';

function Label({ children }: { children: string }) {
  return (
    <Text variant="micro" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {children}
    </Text>
  );
}

/** One end of the journey: its heading, then the fields in pairs. */
function PlaceColumn({
  title,
  icon,
  place,
  onChange,
  errors,
  prefix,
  onPickState,
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  place: EwayPlace;
  onChange: (p: EwayPlace) => void;
  errors: Record<string, string>;
  prefix: 'from' | 'to';
  onPickState: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance']);
  return (
    <View style={{ flex: 1, minWidth: 0, gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={icon} size={16} color={t.c.primary} />
        </View>
        <Text weight="700">{title}</Text>
      </View>
      <TextField
        label={tr('compliance:ewb.legalName')}
        value={place.legalName}
        onChangeText={(v) => onChange({ ...place, legalName: v })}
        error={errors[`${prefix}.legalName`]}
      />
      <FieldRow>
        <TextField
          label="GSTIN"
          value={place.gstin}
          onChangeText={(v) => onChange({ ...place, gstin: v.toUpperCase() })}
          autoCapitalize="characters"
          autoCorrect={false}
          error={errors[`${prefix}.gstin`]}
          hint={tr('compliance:ewb.urpHint')}
        />
        <TextField
          label={tr('compliance:ewb.pinCode')}
          value={place.pincode}
          onChangeText={(v) => onChange({ ...place, pincode: v })}
          keyboardType="number-pad"
          maxLength={6}
          error={errors[`${prefix}.pincode`]}
        />
      </FieldRow>
      <TextField
        label={tr('compliance:ewb.address')}
        value={place.address1}
        onChangeText={(v) => onChange({ ...place, address1: v })}
        error={errors[`${prefix}.address1`]}
      />
      <FieldRow>
        <PickerField
          label={tr('compliance:ewb.state')}
          value={place.stateCode ? stateName(place.stateCode) : undefined}
          placeholder={tr('compliance:ewb.chooseState')}
          onPress={onPickState}
          icon="map-marker-outline"
          error={errors[`${prefix}.stateCode`]}
        />
        <CityField
          label={tr('compliance:ewb.place')}
          value={place.place}
          onChange={(v) => onChange({ ...place, place: v })}
          stateCode={place.stateCode}
          error={errors[`${prefix}.place`]}
        />
      </FieldRow>
    </View>
  );
}

/** Label-value rows divided by hairlines, as on the e-way bill's own desktop page. */
function SummaryRows({ rows }: { rows: { label: string; value: string }[] }) {
  const t = useTheme();
  return (
    <View>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: t.spacing.md,
            paddingVertical: t.spacing.sm,
            borderTopWidth: i ? 1 : 0,
            borderTopColor: t.c.line,
          }}
        >
          <Text variant="small" tone="muted">
            {r.label}
          </Text>
          <Text variant="small" weight="600" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** How long the bill will last, large, with the rule behind it. */
function ValidityCard({ form }: { form: EwayBillFormState }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance']);
  const { preview, vehicleType } = form;
  return (
    <Card style={{ gap: t.spacing.md }}>
      <Label>{tr('compliance:ewb.validUntil')}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="clock-outline" size={22} color={t.c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" weight="700">
            {formatDate(preview.validUpto.slice(0, 10))}
          </Text>
          <Text variant="small" tone="muted">
            {preview.days} {preview.days === 1 ? 'day' : 'days'} · to midnight
          </Text>
        </View>
      </View>
      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
        {vehicleType === 'overDimensional'
          ? 'Over-dimensional cargo gets one day per 20 km, or part thereof.'
          : 'One day per 200 km, or part thereof.'}{' '}
        It updates as you change the distance or the cargo.
      </Text>
    </Card>
  );
}

/**
 * Raising an e-way bill, laid out for a wide window: the route's two ends side
 * by side and the transport details in pairs, beside a summary of the
 * consignment and the validity it will get; the button to raise it is in the
 * page header. Same state
 * and submit as the phone form (`useEwayBillForm`), whose pickers it reuses.
 */
export function NewEwayBillDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const { documentId } = useLocalSearchParams<{ documentId?: string }>();
  const document = useDocument(documentId);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.newEWayBill') }} />
      {document ? (
        <EwayBillFormDesktop doc={document} />
      ) : (
        <EmptyState illustration="not-found" title={tr('compliance:notFound.docTitle')} message={tr('compliance:notFound.docBody')} />
      )}
    </View>
  );
}

function EwayBillFormDesktop({ doc }: { doc: BusinessDocument }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance']);
  const form = useEwayBillForm(doc);
  const party = useParties().find((p) => p.id === doc.partyId);
  const {
    subSupplyType,
    subSupplyDescription,
    setSubSupplyDescription,
    setSubSupplyOpen,
    from,
    setFrom,
    to,
    setTo,
    setStateSheet,
    transporters,
    transporterId,
    setTransporterId,
    transporterName,
    setTransporterName,
    setTransporterOpen,
    transportMode,
    setTransportMode,
    vehicleType,
    setVehicleType,
    vehicleNumber,
    setVehicleNumber,
    transportDocNumber,
    setTransportDocNumber,
    transportDocDate,
    setTransportDocDate,
    distanceKm,
    setDistanceKm,
    byRoad,
    busy,
    errors,
    submit,
  } = form;

  // The button to raise it sits at the top right, beside the page title. It
  // commits to the portal, so the header's "N" shortcut doesn't run it.
  const inHeader = usePageAction({ label: tr('compliance:ewb.generate'), icon: 'truck-fast-outline', onPress: () => void submit(), loading: busy, shortcut: false });

  const distanceField = (
    <TextField
      label={tr('compliance:ewb.approxDistance')}
      required
      value={distanceKm}
      onChangeText={setDistanceKm}
      keyboardType="number-pad"
      suffix="km"
      error={errors.distanceKm}
    />
  );

  const main = (
    <View style={{ gap: t.spacing.lg }}>
      <FormSection title={tr('compliance:ewb.route')}>
        <View style={{ flexDirection: 'row', gap: t.spacing.xl }}>
          <PlaceColumn
            title={tr('compliance:ewb.from')}
            icon="warehouse"
            place={from}
            onChange={setFrom}
            errors={errors}
            prefix="from"
            onPickState={() => setStateSheet('from')}
          />
          <View style={{ width: 1, backgroundColor: t.c.line }} />
          <PlaceColumn
            title={tr('compliance:ewb.to')}
            icon="map-marker-radius-outline"
            place={to}
            onChange={setTo}
            errors={errors}
            prefix="to"
            onPickState={() => setStateSheet('to')}
          />
        </View>
      </FormSection>

      <FormSection title={`${tr('compliance:ewb.transport')} · Part-B`}>
        {transporters.length ? (
          <PickerField
            label={tr('compliance:ewb.savedTransporter')}
            value={transporters.find((x) => x.transporterId === transporterId.trim().toUpperCase())?.name}
            placeholder={tr('compliance:ewb.pickOrType')}
            onPress={() => setTransporterOpen(true)}
            icon="truck-outline"
          />
        ) : null}
        <FieldRow>
          <TextField
            label={tr('compliance:ewb.transporterId')}
            value={transporterId}
            onChangeText={setTransporterId}
            autoCapitalize="characters"
            error={errors.transporterId}
            placeholder="15-character GSTIN or TRANSIN"
          />
          <TextField label={tr('compliance:ewb.transporterName')} value={transporterName} onChangeText={setTransporterName} />
        </FieldRow>
        <FieldRow>
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600">
              {tr('compliance:ewb.mode')}
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
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600">
              {tr('compliance:ewb.cargo')}
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
        </FieldRow>
        {byRoad ? (
          <FieldRow>
            <TextField
              label={tr('compliance:ewb.vehicleNumber')}
              required
              value={vehicleNumber}
              onChangeText={(v) => setVehicleNumber(normalizeVehicleNumber(v))}
              autoCapitalize="characters"
              autoCorrect={false}
              error={errors.vehicleNumber}
              placeholder="MH12AB1234"
            />
            {distanceField}
          </FieldRow>
        ) : (
          <>
            <FieldRow>
              <TextField
                label={tr('compliance:ewb.transportDocNumber')}
                required
                value={transportDocNumber}
                onChangeText={setTransportDocNumber}
                error={errors.transportDocNumber}
                placeholder={tr('compliance:ewb.transportDocHint')}
              />
              <DateField
                label={tr('compliance:ewb.transportDocDate')}
                required
                value={transportDocDate}
                onChange={setTransportDocDate}
                error={errors.transportDocDate}
              />
            </FieldRow>
            {distanceField}
          </>
        )}
      </FormSection>
    </View>
  );

  const side = (
    <>
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="truck-fast-outline" size={22} color={t.c.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Label>{tr('compliance:ewb.consignment')}</Label>
            <Text variant="title" weight="700" numberOfLines={1}>
              {doc.number}
            </Text>
          </View>
        </View>
        <SummaryRows
          rows={[
            ...(party ? [{ label: tr('compliance:ewb.to'), value: party.name }] : []),
            { label: tr('compliance:ewb.dated'), value: formatDate(doc.date) },
            { label: tr('compliance:ewb.value'), value: formatMoney(doc.totals.grandTotal) },
            { label: tr('compliance:ewb.lines'), value: String(doc.lines.length) },
            { label: tr('compliance:ewb.mainHsn'), value: mainHsnCodeOf(doc) ?? '—' },
          ]}
        />
        <PickerField
          label={tr('compliance:ewb.subSupplyType')}
          value={EWAY_SUB_SUPPLY_TYPES[subSupplyType].label}
          onPress={() => setSubSupplyOpen(true)}
          icon="tag-outline"
        />
        {subSupplyType === 'others' ? (
          <TextField
            label={tr('compliance:ewb.describeSubSupply')}
            required
            value={subSupplyDescription}
            onChangeText={setSubSupplyDescription}
            error={errors.subSupplyDescription}
            placeholder={tr('compliance:ewb.whatMoving')}
          />
        ) : null}
      </Card>

      <ValidityCard form={form} />

      {inHeader ? null : <Button title={tr('compliance:ewb.generate')} icon="truck-fast-outline" loading={busy} onPress={submit} fullWidth size="lg" />}
    </>
  );

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl }} keyboardShouldPersistTaps="handled">
        <SplitPane main={main} side={side} sideWidth={360} />
      </ScrollView>
      <EwayBillFormSheets form={form} />
    </>
  );
}
