import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { QrCode } from '@/components/QrCode';
import { MIN_READABLE_QR_SIZE } from '@/lib/qr';
import { BusinessDocument } from '@/types';
import { useAppStore } from '@/store/appStore';
import {
  useActiveCompany,
  useActiveEwayBill,
  useComplianceSettings,
} from '@/store/selectors';
import { canCancelEInvoice, isEInvoiceApplicable } from '@/domain/eInvoice';
import { ewayBillStatusAt, hoursUntilExpiry, isEwayBillRequired } from '@/domain/ewayBill';
import { formatDate, nowISO } from '@/lib/date';
import { EInvoiceSheet } from './EInvoiceSheet';
import { EWAY_STATUS_META, E_INVOICE_STATUS_META, expiryPhrase } from './complianceMeta';

/**
 * The compliance block on a document (FRD 16).
 *
 * It shows even when nothing applies, because "not applicable, and here is
 * why" is information; a section that silently disappears is not.
 */
export function ComplianceCard({ document: doc }: { document: BusinessDocument }) {
  const t = useTheme();
  const router = useRouter();
  const company = useActiveCompany();
  const settings = useComplianceSettings();
  const parties = useAppStore((s) => s.parties);
  const items = useAppStore((s) => s.items);
  const bill = useActiveEwayBill(doc.id);

  const [sheet, setSheet] = useState<'generate' | 'cancel' | null>(null);

  const now = nowISO();
  const applicability = useMemo(
    () =>
      isEInvoiceApplicable({
        document: doc,
        company,
        buyer: parties.find((p) => p.id === doc.partyId),
        settings,
        items,
        now,
      }),
    [doc, company, parties, settings, items, now],
  );

  const requirement = useMemo(
    () => isEwayBillRequired({ document: doc, items, settings }),
    [doc, items, settings],
  );

  const eInvoiceStatus =
    doc.compliance?.eInvoiceStatus ?? (applicability.applicable ? 'pending' : 'notApplicable');
  const eInvoiceMeta = E_INVOICE_STATUS_META[eInvoiceStatus];
  const cancellation = canCancelEInvoice(doc.compliance, now);

  const billStatus = bill ? ewayBillStatusAt(bill, now) : null;
  const billMeta = billStatus ? EWAY_STATUS_META[billStatus] : null;
  const hours = bill ? hoursUntilExpiry(bill, now) : 0;
  const expiringSoon = billStatus === 'active' && hours <= 24;

  // Nothing to say at all on a quotation to a consumer.
  if (!applicability.applicable && !requirement.required && !doc.compliance && !bill) return null;

  return (
    <>
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
        Compliance
      </Text>

      <Card style={{ gap: t.spacing.lg }}>
        {/* ---------------- e-invoice ---------------- */}
        <View style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="small" weight="600">
              E-invoice
            </Text>
            <Badge label={eInvoiceMeta.label} tone={eInvoiceMeta.tone} icon={eInvoiceMeta.icon} />
          </View>

          {eInvoiceStatus === 'notApplicable' ? (
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              {applicability.reason}.
            </Text>
          ) : null}

          {doc.compliance?.irn ? (
            <View style={{ gap: t.spacing.md }}>
              {doc.compliance.signedQrPayload && eInvoiceStatus === 'generated' ? (
                /* Stacked rather than set beside the text, because the symbol
                   cannot be shrunk to make room — see MIN_READABLE_QR_SIZE. */
                <View style={{ alignItems: 'center' }}>
                  <QrCode value={doc.compliance.signedQrPayload} size={MIN_READABLE_QR_SIZE} />
                </View>
              ) : null}
              <View style={{ gap: t.spacing.sm }}>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    IRN
                  </Text>
                  <Text variant="mono" style={{ fontSize: 11, lineHeight: 15 }}>
                    {doc.compliance.irn}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: t.spacing.lg }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="caption" tone="muted">
                      Ack No.
                    </Text>
                    <Text variant="micro">{doc.compliance.ackNo ?? '—'}</Text>
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text variant="caption" tone="muted">
                      Ack date
                    </Text>
                    <Text variant="micro">{doc.compliance.ackDate?.slice(0, 10) ?? '—'}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {eInvoiceStatus === 'cancelled' ? (
            <Text variant="caption" tone="bad" style={{ lineHeight: 18 }}>
              {doc.compliance?.lastMessage ?? 'This IRN was cancelled on the portal.'}
              {doc.compliance?.irnCancelledAt
                ? ` on ${formatDate(doc.compliance.irnCancelledAt.slice(0, 10))}`
                : ''}
            </Text>
          ) : null}

          {eInvoiceStatus === 'failed' && doc.compliance?.eInvoiceIssues?.length ? (
            <View style={{ gap: 4 }}>
              {doc.compliance.eInvoiceIssues
                .filter((i) => i.severity === 'blocking')
                .slice(0, 3)
                .map((issue, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={14}
                      color={t.c.bad}
                      style={{ marginTop: 2 }}
                    />
                    <Text variant="caption" tone="bad" style={{ flex: 1, lineHeight: 18 }}>
                      {issue.message}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}

          {applicability.applicable && eInvoiceStatus !== 'generated' && eInvoiceStatus !== 'cancelled' ? (
            <Button
              title={eInvoiceStatus === 'failed' ? 'Try again' : 'Generate IRN'}
              icon="shield-check-outline"
              size="sm"
              variant="secondary"
              onPress={() => setSheet('generate')}
              fullWidth
            />
          ) : null}

          {eInvoiceStatus === 'generated' ? (
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <Button
                title="View"
                icon="qrcode"
                size="sm"
                variant="ghost"
                onPress={() => setSheet('generate')}
                style={{ flex: 1 }}
              />
              {cancellation.allowed ? (
                <Button
                  title="Cancel IRN"
                  icon="shield-off-outline"
                  size="sm"
                  variant="ghost"
                  onPress={() => setSheet('cancel')}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
          ) : null}

          {eInvoiceStatus === 'generated' && cancellation.allowed && cancellation.deadline ? (
            <Text variant="micro" tone="muted">
              Cancellable until {formatDate(cancellation.deadline.slice(0, 10))},{' '}
              {cancellation.deadline.slice(11, 16)}
            </Text>
          ) : null}
        </View>

        <View style={{ height: 1, backgroundColor: t.c.line }} />

        {/* ---------------- e-way bill ---------------- */}
        <View style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="small" weight="600">
              E-way bill
            </Text>
            {billMeta ? (
              <Badge label={billMeta.label} tone={expiringSoon ? 'warning' : billMeta.tone} icon={billMeta.icon} />
            ) : (
              <Badge
                label={requirement.required ? 'Not raised' : 'Not required'}
                tone={requirement.required ? 'warning' : 'neutral'}
              />
            )}
          </View>

          {!requirement.required && !bill ? (
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              {requirement.reason}.
            </Text>
          ) : null}

          {bill ? (
            <Pressable
              onPress={() => router.push(`/(app)/compliance/eway/${bill.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`E-way bill ${bill.ewayBillNumber}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: t.spacing.sm,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="mono">{bill.ewayBillNumber}</Text>
                <Text variant="caption" tone={expiringSoon ? 'warn' : 'muted'}>
                  {billStatus === 'cancelled'
                    ? `Cancelled ${bill.cancelledAt ? formatDate(bill.cancelledAt.slice(0, 10)) : ''}`
                    : `Valid until ${formatDate(bill.validUpto.slice(0, 10))} · ${expiryPhrase(hours)}`}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
            </Pressable>
          ) : null}

          {requirement.required && (!bill || billStatus !== 'active') ? (
            <Button
              title={bill ? 'Raise a new e-way bill' : 'Generate e-way bill'}
              icon="truck-fast-outline"
              size="sm"
              variant="secondary"
              onPress={() => router.push(`/(app)/compliance/eway/new?documentId=${doc.id}`)}
              fullWidth
            />
          ) : null}
        </View>
      </Card>

      {sheet ? (
        <EInvoiceSheet visible onClose={() => setSheet(null)} document={doc} mode={sheet} />
      ) : null}
    </>
  );
}
