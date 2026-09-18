import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Segmented, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useItems, useParty, useTransporters } from '@/store/selectors';
import { BusinessDocument, EwbPartB, TransportMode, VehicleType } from '@/types';
import { ewbApplicability } from '@/domain/gst/eway/applicability';
import { CargoType, canExtend, isExpired, remainingHours, validityDays } from '@/domain/gst/eway/validity';
import { TRANSPORT_MODE_LABELS, formatVehicleNumber, normalizeVehicleNumber } from '@/domain/gst/eway/vehicle';
import { formatDate, nowISO } from '@/lib/date';
import { ErrorList } from './ErrorList';

const STATUS_TONE = {
  notApplicable: 'neutral',
  pending: 'warning',
  generated: 'success',
  cancelled: 'neutral',
  expired: 'warning',
  failed: 'danger',
} as const;

const STATUS_LABEL = {
  notApplicable: 'Not required',
  pending: 'Required',
  generated: 'In transit',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Rejected',
} as const;

/** The e-way bill panel: Part-A is derived, Part-B is the only thing typed. */
export function EWayBillCard({ document: doc }: { document: BusinessDocument }) {
  const t = useTheme();
  const toast = useToast();
  const company = useActiveCompany();
  const party = useParty(doc.partyId);
  const items = useItems();
  const transporters = useTransporters();

  const generateEWayBill = useAppStore((s) => s.generateEWayBill);
  const updateEwbVehicle = useAppStore((s) => s.updateEwbVehicle);
  const extendEWayBill = useAppStore((s) => s.extendEWayBill);
  const cancelEWayBill = useAppStore((s) => s.cancelEWayBill);

  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [transporterOpen, setTransporterOpen] = useState(false);

  const [mode, setMode] = useState<TransportMode>('1');
  const [vehicleNo, setVehicleNo] = useState('');
  const [transDocNo, setTransDocNo] = useState('');
  const [transporterId, setTransporterId] = useState<string | undefined>();
  const [distance, setDistance] = useState('');
  const [cargo, setCargo] = useState<CargoType>('regular');

  const record = doc.compliance?.eWayBill;
  const now = nowISO();
  const expired = record?.status === 'generated' && isExpired(record.validUpto, now);

  const applicability = useMemo(
    () => (party ? ewbApplicability({ company, party, doc, items }) : null),
    [company, party, doc, items],
  );

  // With no bill yet, the badge has to state whether one is owed — saying
  // "not required" above a line explaining that it is required reads as a bug.
  const status = expired
    ? 'expired'
    : record?.ewbNo || record?.status === 'failed'
      ? record.status
      : applicability?.applicable
        ? 'pending'
        : 'notApplicable';

  if (!party) return null;

  const run = async (
    fn: () => { ok: boolean; errors?: { code: string; message: string }[] },
    okMessage: string,
  ) => {
    setBusy(true);
    try {
      const result = fn();
      if (result.ok) toast.show(okMessage, 'success');
      else toast.show(result.errors?.[0]?.message ?? 'The portal rejected the request', 'error');
      return result;
    } finally {
      setBusy(false);
    }
  };

  const partBFrom = (): EwbPartB => ({
    transMode: mode,
    vehicleNo: mode === '1' ? normalizeVehicleNumber(vehicleNo) : undefined,
    vehicleType: (cargo === 'odc' ? 'O' : 'R') as VehicleType,
    transDocNo: mode === '1' ? undefined : transDocNo || undefined,
    transDocDate: mode === '1' ? undefined : doc.date,
    transporterId,
    transporterName: transporters.find((tr) => tr.transporterId === transporterId)?.name,
  });

  const distanceKm = Number(distance) || 0;
  const hoursLeft = record?.validUpto ? Math.round(remainingHours(record.validUpto, now)) : 0;

  const transportFields = (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" weight="600">
          Mode of transport
        </Text>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as TransportMode)}
          options={(['1', '2', '3', '4'] as TransportMode[]).map((m) => ({
            value: m,
            label: TRANSPORT_MODE_LABELS[m],
          }))}
        />
      </View>

      {mode === '1' ? (
        <TextField
          label="Vehicle number"
          required
          autoCapitalize="characters"
          value={vehicleNo}
          onChangeText={setVehicleNo}
          placeholder="MH 12 AB 1234"
        />
      ) : (
        <TextField
          label="Transport document number"
          required
          value={transDocNo}
          onChangeText={setTransDocNo}
          placeholder="RR / airway bill / bill of lading"
        />
      )}

      <Pressable onPress={() => setTransporterOpen(true)} accessibilityRole="button" accessibilityLabel="Choose a transporter">
        <TextField
          label="Transporter"
          editable={false}
          pointerEvents="none"
          value={transporters.find((tr) => tr.transporterId === transporterId)?.name ?? 'Self'}
        />
      </Pressable>
    </View>
  );

  return (
    <>
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="small" weight="600">
            E-way bill
          </Text>
          <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
        </View>

        {!record && applicability ? (
          <Text variant="small" tone="muted" style={{ lineHeight: 19 }}>
            {applicability.reason}
          </Text>
        ) : null}

        {record?.ewbNo ? (
          <View style={{ gap: t.spacing.md }}>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(record.ewbNo!);
                toast.show('E-way bill number copied', 'success');
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy e-way bill number"
            >
              <Text variant="caption" tone="muted">
                E-way bill no.
              </Text>
              <Text variant="mono">{record.ewbNo}</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: t.spacing.xl, flexWrap: 'wrap' }}>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Valid until
                </Text>
                <Text variant="small">{record.validUpto ? formatDate(record.validUpto.slice(0, 10)) : '—'}</Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Distance
                </Text>
                <Text variant="small">{record.distanceKm} km</Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Vehicle
                </Text>
                <Text variant="small">
                  {record.partB?.vehicleNo ? formatVehicleNumber(record.partB.vehicleNo) : record.partB?.transDocNo ?? '—'}
                </Text>
              </View>
            </View>

            {status === 'generated' ? (
              <Badge
                label={hoursLeft < 24 ? `Expires in ${hoursLeft}h` : `${Math.ceil(hoursLeft / 24)} days left`}
                tone={hoursLeft < 24 ? 'warning' : 'info'}
                icon="clock-outline"
              />
            ) : null}

            {record.cancelledAt ? (
              <Text variant="small" tone="muted">
                Cancelled — {record.cancelReason}
              </Text>
            ) : null}
          </View>
        ) : null}

        <ErrorList errors={status === 'failed' ? record?.errors : undefined} />

        <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
          {applicability?.applicable && status !== 'generated' && status !== 'expired' ? (
            <Button
              title={status === 'failed' ? 'Retry' : 'Generate e-way bill'}
              icon="truck-fast-outline"
              size="sm"
              onPress={() => setFormOpen(true)}
            />
          ) : null}
          {status === 'generated' ? (
            <>
              <Button title="Update vehicle" icon="truck-outline" variant="ghost" size="sm" onPress={() => setUpdateOpen(true)} />
              <Button
                title="Cancel"
                icon="close-circle-outline"
                variant="ghost"
                size="sm"
                loading={busy}
                onPress={() => run(() => cancelEWayBill(doc.id, 'Order cancelled'), 'E-way bill cancelled')}
              />
            </>
          ) : null}
          {status === 'expired' && canExtend(record?.validUpto, now) ? (
            <Button
              title="Extend validity"
              icon="clock-plus-outline"
              size="sm"
              loading={busy}
              onPress={() => run(() => extendEWayBill(doc.id, record?.distanceKm ?? 100), 'Validity extended')}
            />
          ) : null}
        </View>
      </Card>

      <Sheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title="Generate e-way bill"
        subtitle="Part-A comes from the invoice. Part-B is the journey."
        scroll
        footer={
          <Button
            title="Generate"
            fullWidth
            loading={busy}
            disabled={distanceKm <= 0}
            onPress={async () => {
              const result = await run(
                () => generateEWayBill(doc.id, { partB: partBFrom(), distanceKm, cargo }),
                'E-way bill generated',
              );
              if (result.ok) setFormOpen(false);
            }}
          />
        }
      >
        <View style={{ gap: t.spacing.md }}>
          {transportFields}

          <TextField
            label="Approximate distance (km)"
            required
            keyboardType="number-pad"
            value={distance}
            onChangeText={setDistance}
            placeholder="320"
            hint={
              distanceKm > 0
                ? `Valid for ${validityDays(distanceKm, cargo)} day${validityDays(distanceKm, cargo) === 1 ? '' : 's'} — one day per ${cargo === 'odc' ? 20 : 200} km or part thereof.`
                : undefined
            }
          />

          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600">
              Cargo
            </Text>
            <Segmented
              value={cargo}
              onChange={(v) => setCargo(v as CargoType)}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'odc', label: 'Over-dimensional' },
              ]}
            />
          </View>
        </View>
      </Sheet>

      <Sheet
        visible={updateOpen}
        onClose={() => setUpdateOpen(false)}
        title="Update vehicle"
        subtitle="Changing the vehicle does not extend the validity."
        scroll
        footer={
          <Button
            title="Update"
            fullWidth
            loading={busy}
            onPress={async () => {
              const result = await run(() => updateEwbVehicle(doc.id, partBFrom()), 'Vehicle updated');
              if (result.ok) setUpdateOpen(false);
            }}
          />
        }
      >
        {transportFields}
      </Sheet>

      <SelectSheet
        visible={transporterOpen}
        onClose={() => setTransporterOpen(false)}
        title="Transporter"
        value={transporterId ?? 'self'}
        options={[
          { value: 'self', label: 'Self', description: 'Carried on the seller’s own account' },
          ...transporters.map((tr) => ({ value: tr.transporterId, label: tr.name, description: tr.transporterId })),
        ]}
        onSelect={(v) => {
          setTransporterId(v === 'self' ? undefined : v);
          setTransporterOpen(false);
        }}
      />
    </>
  );
}
