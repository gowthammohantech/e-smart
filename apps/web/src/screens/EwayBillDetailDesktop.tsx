import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { keyLabel } from '@esmart/core/labels';
import type { EwayBill } from '@esmart/core/types';
import {
  EWAY_CANCEL_REASONS,
  EWAY_SUB_SUPPLY_TYPES,
  EWAY_TRANSPORT_MODES,
  EWAY_VEHICLE_TYPES,
  canCancelEwayBill,
  canExtendEwayBill,
  canUpdatePartB,
  ewayBillStatusAt,
  hoursUntilExpiry,
} from '@esmart/core/domain/ewayBill';
import { formatDate, formatDateTime, nowISO } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { useAppStore } from '@esmart/app/store/appStore';
import { useEwayBill, useParties } from '@esmart/app/store/selectors';
import { detailRouteFor } from '@esmart/app/features/documents/DocumentEditor';
import { EwayBillActionSheets, useEwayBillHistory, type EwayBillAction } from '@esmart/app/features/compliance/EwayBillDetail';
import { EWAY_STATUS_META, expiryPhrase } from '@esmart/app/features/compliance/complianceMeta';

/** A small label over a value, for the facts along the top. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <View style={{ flex: 1, minWidth: 140, gap: 4 }}>
      <Text variant="micro" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text weight="600" tone={tone} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="micro" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {children}
    </Text>
  );
}

/** Label-value rows divided by hairlines, as on the other desktop detail pages. */
function DetailRows({ rows }: { rows: { label: string; value: string }[] }) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.spacing.md }}>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: t.spacing.md,
            paddingBottom: i < rows.length - 1 ? t.spacing.md : 0,
            borderBottomWidth: i < rows.length - 1 ? 1 : 0,
            borderBottomColor: t.c.line,
          }}
        >
          <Text variant="small" tone="muted">
            {r.label}
          </Text>
          <Text variant="small" weight="600" style={{ flexShrink: 1, textAlign: 'right' }}>
            {r.value}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** One end of the journey. */
function Leg({ title, place }: { title: string; place: EwayBill['from'] }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <SectionTitle>{title}</SectionTitle>
      <Text weight="600">{place.legalName}</Text>
      <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
        {place.address1}
        {place.address2 ? `, ${place.address2}` : ''}
        {'\n'}
        {place.place} {place.pincode}
      </Text>
      {place.gstin ? (
        <Text variant="caption" tone="muted">
          GSTIN {place.gstin}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One e-way bill, laid out for a wide window: the number, status and actions
 * on top, the route and its history beside the document, consignment and
 * transport. Same data and actions as the phone screen
 * (`@esmart/app/features/compliance/EwayBillDetail`), whose sheets it reuses.
 */
export function EwayBillDetailDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'common']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const bill = useEwayBill(id);

  if (!bill) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <EmptyState illustration="not-found" title={tr('compliance:notFound.ewbTitle')} message={tr('compliance:notFound.ewbBody')} />
      </View>
    );
  }
  return <EwayBillDesktop bill={bill} />;
}

function EwayBillDesktop({ bill }: { bill: EwayBill }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'common']);
  const router = useRouter();
  const documents = useAppStore((s) => s.documents);
  const parties = useParties();
  const history = useEwayBillHistory(bill);
  const [action, setAction] = useState<EwayBillAction | null>(null);

  const now = nowISO();
  const status = ewayBillStatusAt(bill, now);
  const meta = EWAY_STATUS_META[status];
  const hours = hoursUntilExpiry(bill, now);
  const expiringSoon = status === 'active' && hours <= 24;
  const extension = canExtendEwayBill(bill, now);
  const cancellation = canCancelEwayBill(bill, now);
  const partB = canUpdatePartB(bill, now);

  const doc = documents.find((d) => d.id === bill.documentId);
  const party = parties.find((p) => p.id === bill.partyId);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: `E-way bill ${bill.ewayBillNumber}` }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }}>
        {/* The headline: number, status, what can be done next */}
        <Card style={{ padding: t.spacing.xxl, gap: t.spacing.xl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xl }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: t.c.chip,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name="truck-fast-outline" size={30} color={t.c.primary} />
            </View>

            <View style={{ flexGrow: 1, flexBasis: 280, gap: 4 }}>
              <SectionTitle>{tr('compliance:ewb.number')}</SectionTitle>
              <Text variant="display" weight="700" style={{ letterSpacing: 1 }}>
                {bill.ewayBillNumber}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.sm }}>
                <Badge label={keyLabel(tr, meta.labelKey)} tone={expiringSoon ? 'warning' : meta.tone} icon={meta.icon} />
                {status !== 'cancelled' ? (
                  <Text variant="small" tone={expiringSoon ? 'warn' : 'muted'}>
                    {expiryPhrase(tr, hours)} · midnight expiry, per rule 138(10)
                  </Text>
                ) : (
                  <Text variant="small" tone="muted">
                    Cancelled{bill.cancelledAt ? ` on ${formatDateTime(bill.cancelledAt)}` : ''}
                    {bill.cancelReasonCode ? ` · ${EWAY_CANCEL_REASONS[bill.cancelReasonCode]}` : ''}
                    {bill.cancelRemark ? `. ${bill.cancelRemark}` : ''}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: t.spacing.sm, maxWidth: 460 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: t.spacing.sm }}>
                <Button
                  title={tr('compliance:ewb.updatePartB')}
                  icon="truck-outline"
                  variant="secondary"
                  size="sm"
                  disabled={!partB.allowed}
                  onPress={() => setAction('partB')}
                />
                <Button
                  title={tr('compliance:ewb.extend')}
                  icon="clock-plus-outline"
                  variant="ghost"
                  size="sm"
                  disabled={!extension.allowed}
                  onPress={() => setAction('extend')}
                />
                {cancellation.allowed ? (
                  <Button
                    title={tr('compliance:ewb.cancelBill')}
                    icon="close-octagon-outline"
                    variant="danger"
                    size="sm"
                    onPress={() => setAction('cancel')}
                  />
                ) : null}
              </View>
              {/* Saying why an action is shut is more use than hiding it. */}
              {!extension.allowed && status !== 'cancelled' ? (
                <Text variant="caption" tone="muted" style={{ textAlign: 'right' }}>
                  {extension.reason} — the window runs from {formatDateTime(extension.opensAt)} to {formatDateTime(extension.closesAt)}.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: t.c.line }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xl }}>
            <Fact label={tr('compliance:ewb.validFrom')} value={formatDate(bill.validFrom.slice(0, 10))} />
            <Fact label={tr('compliance:ewb.validUntil')} value={formatDate(bill.validUpto.slice(0, 10))} tone={expiringSoon ? 'warn' : undefined} />
            <Fact label="Distance" value={`${bill.distanceKm} km`} />
            <Fact label={tr('compliance:ewb.totalValue')} value={formatMoney(bill.consignmentValue)} />
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg, alignItems: 'flex-start' }}>
          {/* Where it goes, and what happened on the way */}
          <View style={{ flexGrow: 3, flexBasis: 420, gap: t.spacing.lg, minWidth: 0 }}>
            <View style={{ gap: t.spacing.md }}>
              <SectionTitle>{tr('compliance:ewb.route')}</SectionTitle>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xl }}>
                <Leg title={tr('compliance:ewb.from')} place={bill.from} />
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <MaterialCommunityIcons name="arrow-right" size={22} color={t.c.primary} />
                  <Text variant="caption" tone="muted">
                    {bill.distanceKm} km
                  </Text>
                </View>
                <Leg title={tr('compliance:ewb.to')} place={bill.to} />
              </Card>
            </View>

            <View style={{ gap: t.spacing.md }}>
              <SectionTitle>{tr('compliance:ewb.history')}</SectionTitle>
              {history.length ? (
                <Card padded={false}>
                  {history.map((entry, i) => (
                    <View
                      key={`${entry.at}-${i}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: t.spacing.md,
                        paddingVertical: t.spacing.md,
                        paddingHorizontal: t.spacing.lg,
                        borderBottomWidth: i < history.length - 1 ? 1 : 0,
                        borderBottomColor: t.c.line,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: entry.kind === 'extension' ? t.c.warnSoft : t.c.chip,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name={entry.icon} size={17} color={entry.kind === 'extension' ? t.c.warn : t.c.primary} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="small" weight="600">
                          {entry.label}
                        </Text>
                        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
                          {entry.detail}
                        </Text>
                      </View>
                      <Text variant="caption" tone="muted">
                        {formatDateTime(entry.at)}
                      </Text>
                    </View>
                  ))}
                </Card>
              ) : (
                <Card padded={false}>
                  <EmptyState icon="history" title="No changes yet" message="Part-B updates and extensions appear here." compact />
                </Card>
              )}
            </View>
          </View>

          {/* The document it covers, and its particulars */}
          <View style={{ flexGrow: 2, flexBasis: 320, gap: t.spacing.lg, minWidth: 0 }}>
            {doc ? (
              <View style={{ gap: t.spacing.md }}>
                <SectionTitle>Document</SectionTitle>
                <Pressable
                  onPress={() => router.push(detailRouteFor(doc.kind, doc.id) as never)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${doc.number}`}
                  style={(state) => {
                    const { hovered, focused } = state as WebPressState;
                    return [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        padding: t.spacing.lg,
                        borderRadius: t.radius.lg,
                        backgroundColor: hovered ? t.c.card2 : t.c.card,
                        borderWidth: t.scheme === 'dark' ? 1 : 0,
                        borderColor: t.c.line,
                      },
                      focusRing(t, focused),
                    ];
                  }}
                >
                  {party ? <Avatar name={party.name} size={44} /> : <MaterialCommunityIcons name="file-document-outline" size={24} color={t.c.primary} />}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text weight="600" numberOfLines={1}>
                      {doc.number}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {party?.name ?? 'Unknown'} · {formatMoney(bill.consignmentValue)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
                </Pressable>
              </View>
            ) : null}

            <View style={{ gap: t.spacing.md }}>
              <SectionTitle>{tr('compliance:ewb.consignment')}</SectionTitle>
              <DetailRows
                rows={[
                  { label: tr('compliance:ewb.supply'), value: EWAY_SUB_SUPPLY_TYPES[bill.subSupplyType].label },
                  { label: tr('compliance:ewb.documentType'), value: bill.docType },
                  { label: tr('compliance:ewb.taxableValue'), value: formatMoney(bill.taxableValue) },
                  { label: tr('compliance:ewb.totalValue'), value: formatMoney(bill.consignmentValue) },
                  { label: tr('compliance:ewb.mainHsn'), value: bill.mainHsnCode ?? '—' },
                  { label: tr('compliance:ewb.lines'), value: String(bill.itemCount) },
                ]}
              />
            </View>

            <View style={{ gap: t.spacing.md }}>
              <SectionTitle>{tr('compliance:ewb.transport')}</SectionTitle>
              <DetailRows
                rows={[
                  { label: tr('compliance:ewb.mode'), value: EWAY_TRANSPORT_MODES[bill.transportMode].label },
                  { label: tr('compliance:ewb.cargo'), value: EWAY_VEHICLE_TYPES[bill.vehicleType].label },
                  ...(bill.vehicleNumber ? [{ label: tr('compliance:ewb.vehicle'), value: bill.vehicleNumber }] : []),
                  ...(bill.transportDocNumber ? [{ label: tr('compliance:ewb.transportDocument'), value: bill.transportDocNumber }] : []),
                  ...(bill.transporterName ? [{ label: tr('compliance:ewb.transporter'), value: bill.transporterName }] : []),
                  ...(bill.transporterId ? [{ label: tr('compliance:ewb.transporterId'), value: bill.transporterId }] : []),
                ]}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <EwayBillActionSheets bill={bill} open={action} onClose={() => setAction(null)} />
    </View>
  );
}
