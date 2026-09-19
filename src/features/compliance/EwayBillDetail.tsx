import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Segmented, TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import {
  CancelReasonCode,
  EwayBill,
  EwayExtendReasonCode,
  EwayPartBReasonCode,
  TransportMode,
  VehicleType,
} from '@/types';
import { useAppStore } from '@/store/appStore';
import { useParties } from '@/store/selectors';
import {
  EWAY_CANCEL_REASONS,
  EWAY_EXTEND_REASONS,
  EWAY_PART_B_REASONS,
  EWAY_SUB_SUPPLY_TYPES,
  EWAY_TRANSPORT_MODES,
  EWAY_VEHICLE_TYPES,
  canCancelEwayBill,
  canExtendEwayBill,
  canUpdatePartB,
  ewayBillStatusAt,
  hoursUntilExpiry,
  normalizeVehicleNumber,
} from '@/domain/ewayBill';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import { formatDate, formatDateTime, nowISO } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { EWAY_STATUS_META, expiryPhrase } from './complianceMeta';

type Entry =
  | { at: string; kind: 'partB'; label: string; detail: string; icon: 'truck-outline' }
  | { at: string; kind: 'extension'; label: string; detail: string; icon: 'clock-plus-outline' };

export function EwayBillDetail({ bill }: { bill: EwayBill }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();

  const documents = useAppStore((s) => s.documents);
  const parties = useParties();
  const updatePartB = useAppStore((s) => s.updateEwayBillPartB);
  const extend = useAppStore((s) => s.extendEwayBill);
  const cancel = useAppStore((s) => s.cancelEwayBill);

  const [partBOpen, setPartBOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<{ code: CancelReasonCode; remark?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const now = nowISO();
  const status = ewayBillStatusAt(bill, now);
  const meta = EWAY_STATUS_META[status];
  const hours = hoursUntilExpiry(bill, now);
  const extension = canExtendEwayBill(bill, now);
  const cancellation = canCancelEwayBill(bill, now);
  const partB = canUpdatePartB(bill, now);

  const doc = documents.find((d) => d.id === bill.documentId);
  const party = parties.find((p) => p.id === bill.partyId);

  const history = useMemo<Entry[]>(() => {
    const out: Entry[] = [
      ...bill.partBUpdates.map<Entry>((u) => ({
        at: u.updatedAt,
        kind: 'partB',
        icon: 'truck-outline',
        label: EWAY_PART_B_REASONS[u.reasonCode],
        detail: [
          u.vehicleNumber ?? u.transportDocNumber,
          EWAY_TRANSPORT_MODES[u.mode].label,
          u.fromPlace,
          u.remark,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
      ...bill.extensions.map<Entry>((e) => ({
        at: e.extendedAt,
        kind: 'extension',
        icon: 'clock-plus-outline',
        label: `Extended · ${EWAY_EXTEND_REASONS[e.reasonCode]}`,
        detail: [
          `${e.remainingDistanceKm} km left from ${e.currentPlace}`,
          `now valid to ${formatDate(e.newValidUpto.slice(0, 10))}`,
          e.remark,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    ];
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [bill]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: 4 }}>
              <Text variant="caption" tone="muted">
                E-way bill number
              </Text>
              <Text variant="h3" style={{ letterSpacing: 1 }}>
                {bill.ewayBillNumber}
              </Text>
            </View>
            <Badge
              label={meta.label}
              tone={status === 'active' && hours <= 24 ? 'warning' : meta.tone}
              icon={meta.icon}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: t.spacing.xl }}>
            <View style={{ gap: 2 }}>
              <Text variant="caption" tone="muted">
                Valid from
              </Text>
              <Text variant="small">{formatDate(bill.validFrom.slice(0, 10))}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text variant="caption" tone="muted">
                Valid until
              </Text>
              <Text variant="small">{formatDate(bill.validUpto.slice(0, 10))}</Text>
            </View>
          </View>

          {status !== 'cancelled' ? (
            <Text variant="caption" tone={hours <= 24 ? 'warn' : 'muted'}>
              {expiryPhrase(hours)} · midnight expiry, per rule 138(10)
            </Text>
          ) : (
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              Cancelled{bill.cancelledAt ? ` on ${formatDateTime(bill.cancelledAt)}` : ''}
              {bill.cancelReasonCode ? ` · ${EWAY_CANCEL_REASONS[bill.cancelReasonCode]}` : ''}
              {bill.cancelRemark ? `. ${bill.cancelRemark}` : ''}
            </Text>
          )}

          {doc ? (
            <Pressable
              onPress={() => router.push(detailRouteFor(doc.kind, doc.id) as never)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingTop: t.spacing.sm,
                borderTopWidth: 1,
                borderTopColor: t.c.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <MaterialCommunityIcons name="file-document-outline" size={20} color={t.c.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="small" weight="600">
                  {doc.number}
                </Text>
                <Text variant="caption" tone="muted">
                  {party?.name ?? 'Unknown'} · {formatMoney(bill.consignmentValue)}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
            </Pressable>
          ) : null}
        </Card>

        <SectionLabel>Consignment</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <Row label="Supply" value={EWAY_SUB_SUPPLY_TYPES[bill.subSupplyType].label} />
          <Row label="Document type" value={bill.docType} />
          <Row label="Taxable value" value={formatMoney(bill.taxableValue)} />
          <Row label="Total value" value={formatMoney(bill.consignmentValue)} />
          <Row label="Main HSN" value={bill.mainHsnCode ?? '—'} />
          <Row label="Lines" value={String(bill.itemCount)} />
        </Card>

        <SectionLabel>Route</SectionLabel>
        <Card style={{ gap: t.spacing.md }}>
          <Leg title="From" place={bill.from} />
          <View style={{ height: 1, backgroundColor: t.c.line }} />
          <Leg title="To" place={bill.to} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color={t.c.muted} />
            <Text variant="caption" tone="muted">
              {bill.distanceKm} km
            </Text>
          </View>
        </Card>

        <SectionLabel>Transport</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <Row label="Mode" value={EWAY_TRANSPORT_MODES[bill.transportMode].label} />
          <Row label="Cargo" value={EWAY_VEHICLE_TYPES[bill.vehicleType].label} />
          {bill.vehicleNumber ? <Row label="Vehicle" value={bill.vehicleNumber} /> : null}
          {bill.transportDocNumber ? (
            <Row label="Transport document" value={bill.transportDocNumber} />
          ) : null}
          {bill.transporterName ? <Row label="Transporter" value={bill.transporterName} /> : null}
          {bill.transporterId ? <Row label="Transporter ID" value={bill.transporterId} /> : null}
        </Card>

        {history.length ? (
          <>
            <SectionLabel>History</SectionLabel>
            <Card padded={false}>
              {history.map((entry, i) => (
                <View
                  key={`${entry.at}-${i}`}
                  style={{
                    flexDirection: 'row',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < history.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                  }}
                >
                  <MaterialCommunityIcons
                    name={entry.icon}
                    size={18}
                    color={entry.kind === 'extension' ? t.c.warn : t.c.primary}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="small" weight="600">
                      {entry.label}
                    </Text>
                    <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                      {entry.detail}
                    </Text>
                    <Text variant="micro" tone="muted">
                      {formatDateTime(entry.at)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}
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
          gap: t.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button
            title="Update Part-B"
            icon="truck-outline"
            variant="secondary"
            disabled={!partB.allowed}
            onPress={() => setPartBOpen(true)}
            style={{ flex: 1 }}
          />
          <Button
            title="Extend"
            icon="clock-plus-outline"
            variant="ghost"
            disabled={!extension.allowed}
            onPress={() => setExtendOpen(true)}
            style={{ flex: 1 }}
          />
        </View>
        {cancellation.allowed ? (
          <Button
            title="Cancel this bill"
            icon="close-octagon-outline"
            variant="ghost"
            onPress={() => setCancelOpen(true)}
            fullWidth
          />
        ) : null}
        {/* Saying why an action is shut is more use than hiding it. */}
        {!extension.allowed && status !== 'cancelled' ? (
          <Text variant="micro" tone="muted" center>
            {extension.reason} — the window runs from {formatDateTime(extension.opensAt)} to{' '}
            {formatDateTime(extension.closesAt)}.
          </Text>
        ) : null}
      </View>

      <PartBSheet
        visible={partBOpen}
        onClose={() => setPartBOpen(false)}
        bill={bill}
        busy={busy}
        onSubmit={(update) => {
          setBusy(true);
          const outcome = updatePartB(bill.id, update);
          setBusy(false);
          if (outcome.ok) {
            toast.show('Part-B updated', 'success');
            setPartBOpen(false);
          } else {
            toast.show(outcome.issues[0]?.message ?? 'Part-B could not be updated', 'error');
          }
        }}
      />

      <ExtendSheet
        visible={extendOpen}
        onClose={() => setExtendOpen(false)}
        bill={bill}
        busy={busy}
        onSubmit={(args) => {
          setBusy(true);
          const outcome = extend(bill.id, args);
          setBusy(false);
          if (outcome.ok) {
            toast.show('Validity extended', 'success');
            setExtendOpen(false);
          } else {
            toast.show(outcome.issues[0]?.message ?? 'The bill could not be extended', 'error');
          }
        }}
      />

      <CancelSheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        deadline={cancellation.deadline}
        onSubmit={(code, remark) => {
          setCancelOpen(false);
          setPendingCancel({ code, remark });
        }}
      />

      <ConfirmDialog
        visible={pendingCancel !== null}
        title="Cancel this e-way bill?"
        message="The bill will be withdrawn from the portal. Goods already in transit must not move against a cancelled bill."
        confirmLabel="Cancel the bill"
        destructive
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          const args = pendingCancel;
          setPendingCancel(null);
          if (!args) return;
          const outcome = cancel(bill.id, args.code, args.remark);
          if (outcome.ok) toast.show('E-way bill cancelled', 'success');
          else toast.show(outcome.issues[0]?.message ?? 'The bill could not be cancelled', 'error');
        }}
      />
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text
      variant="caption"
      tone="muted"
      weight="600"
      style={{
        marginTop: t.spacing.xl,
        marginBottom: t.spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
      }}
    >
      {children}
    </Text>
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

function Leg({ title, place }: { title: string; place: EwayBill['from'] }) {
  const t = useTheme();
  return (
    <View style={{ gap: 3 }}>
      <Text variant="caption" tone="muted" weight="600">
        {title}
      </Text>
      <Text variant="small" weight="600">
        {place.legalName}
      </Text>
      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
        {place.address1}
        {place.address2 ? `, ${place.address2}` : ''}
        {'\n'}
        {place.place} {place.pincode}
      </Text>
      <Text variant="micro" tone="muted" style={{ marginTop: 2 }}>
        {place.gstin}
      </Text>
      <View style={{ height: 0, marginBottom: t.spacing.xs }} />
    </View>
  );
}

function PartBSheet({
  visible,
  onClose,
  bill,
  busy,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  bill: EwayBill;
  busy: boolean;
  onSubmit: (update: {
    mode: TransportMode;
    vehicleNumber?: string;
    vehicleType: VehicleType;
    transportDocNumber?: string;
    transportDocDate?: string;
    fromPlace: string;
    fromStateCode: string;
    reasonCode: EwayPartBReasonCode;
    remark?: string;
  }) => void;
}) {
  const t = useTheme();
  const [mode, setMode] = useState<TransportMode>(bill.transportMode);
  const [vehicleNumber, setVehicleNumber] = useState(bill.vehicleNumber ?? '');
  const [docNumber, setDocNumber] = useState(bill.transportDocNumber ?? '');
  const [fromPlace, setFromPlace] = useState(bill.from.place);
  const [reasonCode, setReasonCode] = useState<EwayPartBReasonCode>('2');
  const [remark, setRemark] = useState('');

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Update Part-B"
      subtitle={bill.ewayBillNumber}
      footer={
        <Button
          title="Save Part-B"
          loading={busy}
          onPress={() =>
            onSubmit({
              mode,
              vehicleNumber: mode === 'road' ? vehicleNumber.trim().toUpperCase() : undefined,
              vehicleType: bill.vehicleType,
              transportDocNumber: mode === 'road' ? undefined : docNumber.trim() || undefined,
              transportDocDate: mode === 'road' ? undefined : bill.documentDate,
              fromPlace: fromPlace.trim(),
              fromStateCode: bill.from.stateCode,
              reasonCode,
              remark: remark.trim() || undefined,
            })
          }
          fullWidth
        />
      }
    >
      <View style={{ gap: t.spacing.md }}>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          Part-B records each leg of the journey. Add an entry whenever the vehicle changes — a
          breakdown, a transhipment, or a fresh carrier.
        </Text>

        <Segmented
          options={[
            { value: 'road', label: 'Road' },
            { value: 'rail', label: 'Rail' },
            { value: 'air', label: 'Air' },
            { value: 'ship', label: 'Ship' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'road' ? (
          <TextField
            label="Vehicle number"
            required
            value={vehicleNumber}
            onChangeText={(v) => setVehicleNumber(normalizeVehicleNumber(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="MH12AB1234"
          />
        ) : (
          <TextField
            label="Transport document number"
            required
            value={docNumber}
            onChangeText={setDocNumber}
          />
        )}

        <TextField label="Leg starts from" value={fromPlace} onChangeText={setFromPlace} />

        <View style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600">
            Reason
          </Text>
          <Segmented
            options={(Object.keys(EWAY_PART_B_REASONS) as EwayPartBReasonCode[]).map((code) => ({
              value: code,
              label: EWAY_PART_B_REASONS[code],
            }))}
            value={reasonCode}
            onChange={setReasonCode}
            size="sm"
          />
        </View>

        <TextField label="Remark" value={remark} onChangeText={setRemark} multiline />
      </View>
    </Sheet>
  );
}

function ExtendSheet({
  visible,
  onClose,
  bill,
  busy,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  bill: EwayBill;
  busy: boolean;
  onSubmit: (args: {
    remainingDistanceKm: number;
    reasonCode: EwayExtendReasonCode;
    remark?: string;
    transitType: 'inTransit' | 'inMovement';
    currentPlace: string;
    currentPincode: string;
    currentStateCode: string;
  }) => void;
}) {
  const t = useTheme();
  const [remaining, setRemaining] = useState('');
  const [reasonCode, setReasonCode] = useState<EwayExtendReasonCode>('3');
  const [remark, setRemark] = useState('');
  const [transitType, setTransitType] = useState<'inTransit' | 'inMovement'>('inMovement');
  const [place, setPlace] = useState(bill.to.place);
  const [pincode, setPincode] = useState(bill.to.pincode);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Extend validity"
      subtitle={bill.ewayBillNumber}
      footer={
        <Button
          title="Extend"
          loading={busy}
          disabled={!(Number(remaining) > 0)}
          onPress={() =>
            onSubmit({
              remainingDistanceKm: Number(remaining) || 0,
              reasonCode,
              remark: remark.trim() || undefined,
              transitType,
              currentPlace: place.trim(),
              currentPincode: pincode.trim(),
              currentStateCode: bill.to.stateCode,
            })
          }
          fullWidth
        />
      }
    >
      <View style={{ gap: t.spacing.md }}>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          The new validity is worked out from the distance still to cover, not the original journey,
          and counted from now.
        </Text>

        <TextField
          label="Distance still to cover"
          required
          value={remaining}
          onChangeText={setRemaining}
          keyboardType="number-pad"
          suffix="km"
        />

        <Segmented
          options={[
            { value: 'inMovement', label: 'In movement' },
            { value: 'inTransit', label: 'In transit' },
          ]}
          value={transitType}
          onChange={setTransitType}
        />

        <TextField label="Where the goods are now" value={place} onChangeText={setPlace} />
        <TextField
          label="PIN code"
          value={pincode}
          onChangeText={setPincode}
          keyboardType="number-pad"
          maxLength={6}
        />

        <View style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600">
            Reason
          </Text>
          {(Object.keys(EWAY_EXTEND_REASONS) as EwayExtendReasonCode[]).map((code) => (
            <Pressable
              key={code}
              onPress={() => setReasonCode(code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reasonCode === code }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: t.spacing.sm,
                paddingHorizontal: t.spacing.md,
                borderRadius: t.radius.md,
                backgroundColor: reasonCode === code ? t.c.chip : 'transparent',
              }}
            >
              <MaterialCommunityIcons
                name={reasonCode === code ? 'radiobox-marked' : 'radiobox-blank'}
                size={18}
                color={reasonCode === code ? t.c.primary : t.c.muted}
              />
              <Text variant="small">{EWAY_EXTEND_REASONS[code]}</Text>
            </Pressable>
          ))}
        </View>

        <TextField label="Remark" value={remark} onChangeText={setRemark} multiline />
      </View>
    </Sheet>
  );
}

function CancelSheet({
  visible,
  onClose,
  deadline,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  deadline: string;
  onSubmit: (code: CancelReasonCode, remark?: string) => void;
}) {
  const t = useTheme();
  const [reasonCode, setReasonCode] = useState<CancelReasonCode>('2');
  const [remark, setRemark] = useState('');

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Cancel the e-way bill"
      footer={
        <Button
          title="Continue"
          variant="danger"
          onPress={() => onSubmit(reasonCode, remark.trim() || undefined)}
          fullWidth
        />
      }
    >
      <View style={{ gap: t.spacing.md }}>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          A bill can be cancelled within 24 hours of being raised, and only if it has not already been
          verified in transit. This one can be cancelled until {formatDateTime(deadline)}.
        </Text>

        {(Object.keys(EWAY_CANCEL_REASONS) as CancelReasonCode[]).map((code) => (
          <Pressable
            key={code}
            onPress={() => setReasonCode(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reasonCode === code }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.sm,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radius.md,
              backgroundColor: reasonCode === code ? t.c.chip : 'transparent',
            }}
          >
            <MaterialCommunityIcons
              name={reasonCode === code ? 'radiobox-marked' : 'radiobox-blank'}
              size={18}
              color={reasonCode === code ? t.c.primary : t.c.muted}
            />
            <Text variant="small">{EWAY_CANCEL_REASONS[code]}</Text>
          </Pressable>
        ))}

        <TextField label="Remark" value={remark} onChangeText={setRemark} multiline />
      </View>
    </Sheet>
  );
}
