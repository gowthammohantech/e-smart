import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { AmountField, Segmented, SwitchField, TextField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { ComplianceSettings, TransportMode, VehicleType } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, useComplianceSettings, useComplianceSummary } from '@/store/selectors';
import { fromMajor, toMajor } from '@/lib/money';

export default function EInvoicingSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const stored = useComplianceSettings();
  const currency = useBaseCurrency();
  const summary = useComplianceSummary();
  const save = useAppStore((s) => s.saveComplianceSettings);

  const [draft, setDraft] = useState<ComplianceSettings>(stored);
  const [turnover, setTurnover] = useState(String(toMajor(stored.annualTurnover)));
  const [threshold, setThreshold] = useState(String(toMajor(stored.eInvoiceTurnoverThreshold)));
  const [ewayThreshold, setEwayThreshold] = useState(String(toMajor(stored.ewayBillThreshold)));

  const patch = (over: Partial<ComplianceSettings>) => setDraft((d) => ({ ...d, ...over }));

  const onSave = () => {
    save({
      ...draft,
      annualTurnover: fromMajor(turnover || '0', currency),
      eInvoiceTurnoverThreshold: fromMajor(threshold || '0', currency),
      ewayBillThreshold: fromMajor(ewayThreshold || '0', currency),
    });
    toast.show(tr('compliance:settings.saved'), 'success');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.eInvoicingAndEWayBill') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Nothing leaves this device. The portal is simulated locally — but the IRN, the signed QR and
            the validity rules are the real ones, so what you see here is what a live portal would return.
          </Text>
        </Card>

        {/* ---------------- e-invoice ---------------- */}
        <SectionLabel>{tr('compliance:settings.eInvoice')}</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <SwitchField
            label={tr('compliance:settings.reportInvoices')}
            description={tr('compliance:settings.reportInvoicesHint')}
            value={draft.eInvoiceEnabled}
            onValueChange={(v) => patch({ eInvoiceEnabled: v })}
          />
          <SwitchField
            label={tr('compliance:settings.reportOnFinalise')}
            description={tr('compliance:settings.reportOnFinaliseHint')}
            value={draft.autoGenerateEInvoiceOnFinalise}
            onValueChange={(v) => patch({ autoGenerateEInvoiceOnFinalise: v })}
            disabled={!draft.eInvoiceEnabled}
          />
        </Card>

        <View style={{ height: t.spacing.md }} />

        <AmountField
          label={tr('compliance:settings.turnover')}
          value={turnover}
          onChangeValue={setTurnover}
          currency={currency}
          hint={tr('compliance:settings.turnoverHint')}
        />
        <AmountField
          label={tr('compliance:settings.mandatoryAbove')}
          value={threshold}
          onChangeValue={setThreshold}
          currency={currency}
          hint={tr('compliance:settings.mandatoryHint')}
        />
        <TextField
          label={tr('compliance:settings.window')}
          value={String(draft.reportingWindowDays)}
          onChangeText={(v) => patch({ reportingWindowDays: Number(v) || 0 })}
          keyboardType="number-pad"
          suffix="days"
          hint={tr('compliance:settings.windowHint')}
        />

        <SectionLabel>{tr('compliance:settings.portalCredentials')}</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <TextField
            label={tr('compliance:settings.portalUsername')}
            value={draft.irpUsername ?? ''}
            onChangeText={(v) => patch({ irpUsername: v })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label={tr('compliance:settings.gspClientId')}
            value={draft.irpClientIdMasked ?? ''}
            onChangeText={(v) => patch({ irpClientIdMasked: v })}
            autoCapitalize="characters"
            autoCorrect={false}
            hint={tr('compliance:settings.credentialHint')}
          />
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
            <Text variant="caption" tone="muted" weight="600">{tr('compliance:settings.environment')}</Text>
            <Segmented
              options={[
                { value: 'sandbox', label: 'Sandbox' },
                { value: 'production', label: 'Production' },
              ]}
              value={draft.irpEnvironment}
              onChange={(v) => patch({ irpEnvironment: v })}
            />
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              Sandbox adds a switch to the generate sheet for simulating a rejection, so the failed state
              can be seen without breaking an invoice.
            </Text>
          </View>
        </Card>

        {/* ---------------- e-way bill ---------------- */}
        <SectionLabel>{tr('compliance:settings.ewayBill')}</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <SwitchField
            label={tr('compliance:settings.raiseEwb')}
            description={tr('compliance:settings.raiseEwbHint')}
            value={draft.ewayBillEnabled}
            onValueChange={(v) => patch({ ewayBillEnabled: v })}
          />
          <SwitchField
            label={tr('compliance:settings.raiseOnFinalise')}
            description={tr('compliance:settings.raiseOnFinaliseHint')}
            value={draft.autoGenerateEwayBillOnFinalise}
            onValueChange={(v) => patch({ autoGenerateEwayBillOnFinalise: v })}
            disabled={!draft.ewayBillEnabled}
          />
        </Card>

        <View style={{ height: t.spacing.md }} />

        <AmountField
          label={tr('compliance:settings.requiredAbove')}
          value={ewayThreshold}
          onChangeValue={setEwayThreshold}
          currency={currency}
          hint={tr('compliance:settings.requiredHint')}
        />
        <TextField
          label={tr('compliance:settings.defaultTransporterId')}
          value={draft.defaultTransporterId ?? ''}
          onChangeText={(v) => patch({ defaultTransporterId: v })}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextField
          label={tr('compliance:settings.defaultTransporter')}
          value={draft.defaultTransporterName ?? ''}
          onChangeText={(v) => patch({ defaultTransporterName: v })}
        />
        <TextField
          label={tr('compliance:settings.defaultDistance')}
          value={String(draft.defaultDistanceKm)}
          onChangeText={(v) => patch({ defaultDistanceKm: Number(v) || 0 })}
          keyboardType="number-pad"
          suffix="km"
        />

        <View style={{ gap: t.spacing.sm, marginBottom: t.spacing.md }}>
          <Text variant="caption" tone="muted" weight="600">{tr('compliance:settings.defaultMode')}</Text>
          <Segmented
            options={[
              { value: 'road', label: 'Road' },
              { value: 'rail', label: 'Rail' },
              { value: 'air', label: 'Air' },
              { value: 'ship', label: 'Ship' },
            ]}
            value={draft.defaultTransportMode}
            onChange={(v: TransportMode) => patch({ defaultTransportMode: v })}
          />
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600">{tr('compliance:settings.defaultCargo')}</Text>
          <Segmented
            options={[
              { value: 'regular', label: 'Regular' },
              { value: 'overDimensional', label: 'Over-dimensional' },
            ]}
            value={draft.defaultVehicleType}
            onChange={(v: VehicleType) => patch({ defaultVehicleType: v })}
          />
        </View>

        {/* ---------------- state ---------------- */}
        <SectionLabel>{tr('compliance:settings.whereThingsStand')}</SectionLabel>
        <Card padded={false}>
          <ListRow
            title={tr('compliance:settings.reportedInvoices')}
            meta={String(summary.eInvoice.generated)}
            icon="shield-check-outline"
            divider
            onPress={() => router.push('/(app)/compliance')}
          />
          <ListRow
            title={tr('compliance:settings.rejectedOrUnreported')}
            meta={String(summary.eInvoice.failed + summary.eInvoice.pending)}
            icon="alert-circle-outline"
            divider
            onPress={() => router.push('/(app)/compliance')}
          />
          <ListRow
            title={tr('compliance:settings.activeEwb')}
            meta={String(summary.eway.active)}
            icon="truck-fast-outline"
            onPress={() => router.push('/(app)/compliance')}
          />
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
        <Button title={tr('compliance:settings.save')} icon="check" onPress={onSave} fullWidth />
      </View>
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
