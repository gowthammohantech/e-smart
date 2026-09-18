import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useItems, useParty } from '@/store/selectors';
import { BusinessDocument, EInvoiceCancelReason } from '@/types';
import { eInvoiceApplicability } from '@/domain/gst/applicability';
import { CANCEL_REASONS } from '@/domain/gst/einvoice/mockIrp';
import { buildEInvoicePayload } from '@/domain/gst/einvoice/buildPayload';
import { toCanonicalJson } from '@/domain/gst/einvoice/schema';
import { formatDateTime } from '@/lib/date';
import { ErrorList } from './ErrorList';
import { SignedQr } from './SignedQr';

const STATUS_TONE = {
  notApplicable: 'neutral',
  pending: 'info',
  generated: 'success',
  cancelled: 'neutral',
  failed: 'danger',
} as const;

const STATUS_LABEL = {
  notApplicable: 'Not applicable',
  pending: 'Pending',
  generated: 'IRN generated',
  cancelled: 'Cancelled',
  failed: 'Rejected',
} as const;

/** The e-invoice panel on a document: state, actions, and the reason for both. */
export function EInvoiceCard({ document: doc }: { document: BusinessDocument }) {
  const t = useTheme();
  const toast = useToast();
  const company = useActiveCompany();
  const party = useParty(doc.partyId);
  const items = useItems();
  const generateEInvoice = useAppStore((s) => s.generateEInvoice);
  const cancelEInvoice = useAppStore((s) => s.cancelEInvoice);

  const [busy, setBusy] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState<EInvoiceCancelReason>('2');
  const [remarks, setRemarks] = useState('');

  const record = doc.compliance?.eInvoice;
  const status = record?.status ?? 'notApplicable';

  const applicability = useMemo(
    () => (party ? eInvoiceApplicability({ company, party, doc }) : null),
    [company, party, doc],
  );

  const payloadJson = useMemo(() => {
    if (!party) return '';
    try {
      return JSON.stringify(JSON.parse(toCanonicalJson(buildEInvoicePayload({ company, party, doc, items }))), null, 2);
    } catch {
      return '';
    }
  }, [company, party, doc, items]);

  if (!party) return null;

  const run = async (fn: () => { ok: boolean; errors?: { code: string; message: string }[] }, okMessage: string) => {
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

  const copy = async (value: string, what: string) => {
    await Clipboard.setStringAsync(value);
    toast.show(`${what} copied`, 'success');
  };

  const canGenerate = applicability?.applicable && status !== 'generated';
  const canCancel = status === 'generated';

  return (
    <>
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="small" weight="600">
            E-invoice
          </Text>
          <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
        </View>

        {status === 'notApplicable' && applicability ? (
          <Text variant="small" tone="muted" style={{ lineHeight: 19 }}>
            {applicability.reason}
          </Text>
        ) : null}

        {record?.irn ? (
          <View style={{ gap: t.spacing.md }}>
            <Pressable onPress={() => copy(record.irn!, 'IRN')} accessibilityRole="button" accessibilityLabel="Copy IRN">
              <Text variant="caption" tone="muted">
                IRN
              </Text>
              <Text variant="mono" style={{ lineHeight: 18 }}>
                {record.irn}
              </Text>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: t.spacing.xl }}>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Ack no.
                </Text>
                <Text variant="mono">
                  {record.ackNo}
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Ack date
                </Text>
                <Text variant="small">{record.ackDate}</Text>
              </View>
            </View>

            {record.signedQrPayload && status === 'generated' ? (
              <SignedQr payload={record.signedQrPayload} />
            ) : null}

            {record.cancelledAt ? (
              <Text variant="small" tone="muted">
                Cancelled {formatDateTime(record.cancelledAt)} —{' '}
                {CANCEL_REASONS.find((r) => r.code === record.cancelReasonCode)?.label ?? 'reason not given'}
                {record.cancelRemarks ? `: ${record.cancelRemarks}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        <ErrorList errors={status === 'failed' ? record?.errors : undefined} />

        <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
          {canGenerate ? (
            <Button
              title={status === 'failed' ? 'Retry' : 'Generate IRN'}
              icon="shield-check-outline"
              size="sm"
              loading={busy}
              onPress={() => run(() => generateEInvoice(doc.id), 'IRN generated')}
            />
          ) : null}
          {canCancel ? (
            <Button title="Cancel IRN" icon="close-circle-outline" variant="ghost" size="sm" onPress={() => setCancelOpen(true)} />
          ) : null}
          {applicability?.applicable ? (
            <Button title="View payload" icon="code-json" variant="ghost" size="sm" onPress={() => setPayloadOpen(true)} />
          ) : null}
        </View>
      </Card>

      <Sheet visible={payloadOpen} onClose={() => setPayloadOpen(false)} title="E-invoice payload" subtitle="NIC schema v1.1" scroll>
        <Pressable onPress={() => copy(payloadJson, 'Payload')} accessibilityRole="button" accessibilityLabel="Copy payload">
          <Text variant="mono" style={{ fontSize: 11, lineHeight: 16 }}>
            {payloadJson}
          </Text>
        </Pressable>
      </Sheet>

      <Sheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this IRN"
        subtitle="The portal allows cancellation within 24 hours of the acknowledgement."
        footer={
          <Button
            title="Cancel IRN"
            variant="danger"
            fullWidth
            loading={busy}
            onPress={async () => {
              const result = await run(() => cancelEInvoice(doc.id, reason, remarks), 'IRN cancelled');
              if (result.ok) {
                setCancelOpen(false);
                setRemarks('');
              }
            }}
          />
        }
      >
        <View style={{ gap: t.spacing.md }}>
          <Pressable onPress={() => setReasonOpen(true)} accessibilityRole="button" accessibilityLabel="Choose a reason">
            <TextField
              label="Reason"
              editable={false}
              pointerEvents="none"
              value={CANCEL_REASONS.find((r) => r.code === reason)?.label}
            />
          </Pressable>
          <TextField
            label="Remarks"
            required={reason === '4'}
            hint={reason === '4' ? 'The portal requires remarks when the reason is "Others".' : undefined}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="What went wrong?"
          />
        </View>
      </Sheet>

      <SelectSheet
        visible={reasonOpen}
        onClose={() => setReasonOpen(false)}
        title="Cancellation reason"
        searchable={false}
        value={reason}
        options={CANCEL_REASONS.map((r) => ({ value: r.code, label: r.label }))}
        onSelect={(v) => {
          setReason(v as EInvoiceCancelReason);
          setReasonOpen(false);
        }}
      />
    </>
  );
}
