import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keyLabel } from '@/i18n/labels';
import { Pressable, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { SwitchField, TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { QrCode } from '@/components/QrCode';
import { MIN_READABLE_QR_SIZE } from '@/lib/qr';
import { BusinessDocument, CancelReasonCode, ComplianceIssue } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useComplianceSettings } from '@/store/selectors';
import {
  E_INVOICE_CANCEL_REASONS,
  E_INVOICE_SUPPLY_TYPES,
  blockingIssues,
  buildIrpPayload,
  canCancelEInvoice,
  irnForDocument,
  isEInvoiceApplicable,
  requiresCancelRemark,
  validateEInvoice,
} from '@/domain/eInvoice';
import { nowISO } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { E_INVOICE_STATUS_META } from './complianceMeta';

/**
 * Reporting an invoice to the portal, and cancelling one (FRD 16).
 *
 * The generate view runs the real validation before it will let the button
 * through, and lists every blocking finding at once. Fixing one field at a
 * time against a portal that only ever names the first problem is the slowest
 * possible way to get an invoice reported.
 */
export function EInvoiceSheet({
  visible,
  onClose,
  document: doc,
  mode,
}: {
  visible: boolean;
  onClose: () => void;
  document: BusinessDocument;
  mode: 'generate' | 'cancel';
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance']);
  const toast = useToast();
  const company = useActiveCompany();
  const settings = useComplianceSettings();

  const parties = useAppStore((s) => s.parties);
  const items = useAppStore((s) => s.items);
  const documents = useAppStore((s) => s.documents);
  const generateEInvoice = useAppStore((s) => s.generateEInvoice);
  const cancelEInvoice = useAppStore((s) => s.cancelEInvoice);

  const [busy, setBusy] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [reasonCode, setReasonCode] = useState<CancelReasonCode>('2');
  const [remark, setRemark] = useState('');
  const [result, setResult] = useState<ComplianceIssue[] | null>(null);

  const ctx = useMemo(
    () => ({
      document: doc,
      company,
      buyer: parties.find((p) => p.id === doc.partyId),
      settings,
      items,
      existingIrns: documents
        .filter((d) => d.id !== doc.id && !!d.compliance?.irn)
        .map((d) => d.compliance!.irn!),
      now: nowISO(),
    }),
    [doc, company, parties, settings, items, documents],
  );

  const applicability = useMemo(() => isEInvoiceApplicable(ctx), [ctx]);
  const issues = useMemo(
    () => (applicability.applicable ? validateEInvoice(ctx) : []),
    [ctx, applicability.applicable],
  );
  const blocking = blockingIssues(issues);
  const warnings = issues.filter((i) => i.severity === 'warning');
  const cancellation = canCancelEInvoice(doc.compliance, nowISO());
  const meta = E_INVOICE_STATUS_META[doc.compliance?.eInvoiceStatus ?? 'pending'];

  const generate = () => {
    setBusy(true);
    const outcome = generateEInvoice(doc.id, {
      simulation: simulateFailure ? { fail: 'SIM001' } : undefined,
    });
    setBusy(false);
    setResult(outcome.issues);
    if (outcome.ok) {
      toast.show(tr('compliance:einv.generated'), 'success');
      onClose();
    } else {
      toast.show(outcome.issues[0]?.message ?? 'The portal refused the invoice', 'error');
    }
  };

  const cancel = () => {
    setBusy(true);
    const outcome = cancelEInvoice(doc.id, reasonCode, remark.trim() || undefined);
    setBusy(false);
    if (outcome.ok) {
      toast.show(tr('compliance:einv.cancelled'), 'success');
      onClose();
    } else {
      toast.show(outcome.issues[0]?.message ?? 'The IRN could not be cancelled', 'error');
    }
  };

  /* ---------------- cancel ---------------- */

  if (mode === 'cancel') {
    const needsRemark = requiresCancelRemark(reasonCode);
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={tr('compliance:einv.cancelIrn')}
        subtitle={doc.number}
        footer={
          <Button
            title={tr('compliance:einv.cancelIrn')}
            variant="danger"
            icon="shield-off-outline"
            loading={busy}
            disabled={!cancellation.allowed || (needsRemark && remark.trim().length === 0)}
            onPress={cancel}
            fullWidth
          />
        }
      >
        <View style={{ gap: t.spacing.lg }}>
          {cancellation.allowed ? (
            <Card variant="flat">
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                Cancelling withdraws the reported invoice from the portal. It cannot be undone, and the
                document number cannot be used again this financial year — raise a fresh invoice instead.
              </Text>
            </Card>
          ) : (
            <Card variant="flat" style={{ borderColor: t.c.bad }}>
              <Text variant="small" tone="bad">
                {cancellation.reason}
              </Text>
            </Card>
          )}

          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600">{tr('compliance:einv.reason')}</Text>
            {(Object.keys(E_INVOICE_CANCEL_REASONS) as CancelReasonCode[]).map((code) => (
              <Pressable
                key={code}
                onPress={() => setReasonCode(code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reasonCode === code }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingVertical: t.spacing.md,
                  paddingHorizontal: t.spacing.lg,
                  borderRadius: t.radius.md,
                  backgroundColor: reasonCode === code ? t.c.chip : t.c.card2,
                }}
              >
                <MaterialCommunityIcons
                  name={reasonCode === code ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={reasonCode === code ? t.c.primary : t.c.muted}
                />
                <Text variant="small">{E_INVOICE_CANCEL_REASONS[code]}</Text>
              </Pressable>
            ))}
          </View>

          <TextField
            label={tr('compliance:einv.remark')}
            required={needsRemark}
            value={remark}
            onChangeText={setRemark}
            placeholder={needsRemark ? 'Say what happened' : 'Optional'}
            multiline
          />
        </View>
      </Sheet>
    );
  }

  /* ---------------- generate ---------------- */

  const reported = doc.compliance?.eInvoiceStatus === 'generated';
  const payload = applicability.applicable ? buildIrpPayload(ctx) : null;
  const projectedIrn = applicability.applicable ? irnForDocument(ctx) : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={reported ? 'E-invoice' : 'Generate the e-invoice'}
      subtitle={doc.number}
      footer={
        reported || !applicability.applicable ? undefined : (
          <View style={{ gap: t.spacing.sm }}>
            {blocking.length > 0 ? (
              <Text variant="caption" tone="bad" center>
                Fix {blocking.length} {blocking.length === 1 ? 'problem' : 'problems'} before reporting.
              </Text>
            ) : null}
            <Button
              title={tr('compliance:einv.generateIrn')}
              icon="shield-check-outline"
              loading={busy}
              disabled={blocking.length > 0}
              onPress={generate}
              fullWidth
            />
          </View>
        )
      }
    >
      <View style={{ gap: t.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="small" weight="600">
            {applicability.applicable ? E_INVOICE_SUPPLY_TYPES[applicability.supplyType!] : 'Not reportable'}
          </Text>
          <Badge label={keyLabel(tr, meta.labelKey)} tone={meta.tone} icon={meta.icon} />
        </View>

        {!applicability.applicable ? (
          <Card variant="flat">
            <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
              {applicability.reason}.
            </Text>
          </Card>
        ) : null}

        {reported ? (
          <Card style={{ gap: t.spacing.md, alignItems: 'center' }}>
            {doc.compliance?.signedQrPayload ? (
              <QrCode value={doc.compliance.signedQrPayload} size={MIN_READABLE_QR_SIZE + 22} />
            ) : null}
            <View style={{ gap: 3, alignSelf: 'stretch' }}>
              <Text variant="caption" tone="muted">
                IRN
              </Text>
              <Text variant="mono" style={{ lineHeight: 16 }}>
                {doc.compliance?.irn}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.xl, alignSelf: 'stretch' }}>
              <View style={{ gap: 3 }}>
                <Text variant="caption" tone="muted">{tr('compliance:einv.ackNo')}</Text>
                <Text variant="small">{doc.compliance?.ackNo}</Text>
              </View>
              <View style={{ gap: 3 }}>
                <Text variant="caption" tone="muted">{tr('compliance:einv.ackDate')}</Text>
                <Text variant="small">{doc.compliance?.ackDate}</Text>
              </View>
            </View>
            <Button
              title={tr('compliance:einv.copyIrn')}
              variant="ghost"
              size="sm"
              icon="content-copy"
              onPress={async () => {
                await Clipboard.setStringAsync(doc.compliance?.irn ?? '');
                toast.show(tr('compliance:einv.copied'), 'success');
              }}
              fullWidth
            />
          </Card>
        ) : null}

        {!reported && applicability.applicable ? (
          <>
            <IssueList
              title={blocking.length ? `${blocking.length} blocking` : 'Portal checks'}
              issues={blocking}
              tone="bad"
              emptyMessage="Every portal check passes."
            />
            {warnings.length ? (
              <IssueList title={tr('compliance:einv.worthKnowing')} issues={warnings} tone="warn" />
            ) : null}

            <Card style={{ gap: t.spacing.sm }}>
              <Text variant="caption" tone="muted" weight="600">{tr('compliance:einv.willReport')}</Text>
              <Row label={tr('compliance:einv.documentType')} value={applicability.docType ?? '—'} />
              <Row label={tr('compliance:einv.placeOfSupply')} value={doc.placeOfSupplyStateCode ?? '—'} />
              <Row label={tr('compliance:einv.lines')} value={String(doc.lines.length)} />
              <Row label={tr('compliance:einv.invoiceValue')} value={formatMoney(doc.totals.grandTotal)} />
              {projectedIrn ? (
                <View style={{ gap: 3, marginTop: t.spacing.xs }}>
                  <Text variant="caption" tone="muted">{tr('compliance:einv.irnProduced')}</Text>
                  <Text variant="mono" tone="muted" style={{ lineHeight: 16 }}>
                    {projectedIrn}
                  </Text>
                </View>
              ) : null}
            </Card>

            <Pressable onPress={() => setShowPayload((v) => !v)} accessibilityRole="button">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <MaterialCommunityIcons
                  name={showPayload ? 'chevron-down' : 'chevron-right'}
                  size={18}
                  color={t.c.muted}
                />
                <Text variant="caption" tone="muted" weight="600">{tr('compliance:einv.payload')}</Text>
              </View>
            </Pressable>
            {showPayload && payload ? (
              <Card variant="flat" padded={false}>
                <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ padding: t.spacing.md }}>
                  <Text variant="mono" tone="muted" style={{ fontSize: 10, lineHeight: 14 }}>
                    {JSON.stringify(payload, null, 2)}
                  </Text>
                </ScrollView>
              </Card>
            ) : null}

            {settings.irpEnvironment === 'sandbox' ? (
              <SwitchField
                label={tr('compliance:einv.simulateRejection')}
                description={tr('compliance:einv.sandboxHint')}
                value={simulateFailure}
                onValueChange={setSimulateFailure}
              />
            ) : null}
          </>
        ) : null}

        {result && result.length && !reported ? (
          <IssueList title={tr('compliance:einv.lastAttempt')} issues={result} tone="bad" />
        ) : null}
      </View>
    </Sheet>
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

export function IssueList({
  title,
  issues,
  tone,
  emptyMessage,
}: {
  title: string;
  issues: ComplianceIssue[];
  tone: 'bad' | 'warn';
  emptyMessage?: string;
}) {
  const t = useTheme();
  if (issues.length === 0 && !emptyMessage) return null;

  return (
    <Card style={{ gap: t.spacing.sm }}>
      <Text variant="caption" tone="muted" weight="600">
        {title}
      </Text>
      {issues.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <MaterialCommunityIcons name="check-circle-outline" size={16} color={t.c.good} />
          <Text variant="small" tone="good">
            {emptyMessage}
          </Text>
        </View>
      ) : (
        issues.map((issue, i) => (
          <View
            key={`${issue.code}-${issue.field}-${i}`}
            style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}
          >
            <MaterialCommunityIcons
              name={tone === 'bad' ? 'alert-circle-outline' : 'information-outline'}
              size={16}
              color={tone === 'bad' ? t.c.bad : t.c.warn}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="small" style={{ lineHeight: 18 }}>
                {issue.message}
              </Text>
              <Text variant="micro" tone="muted">
                {issue.code} · {issue.field}
              </Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}
