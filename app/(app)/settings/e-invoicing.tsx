import React, { useState } from 'react';
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
    toast.show('Compliance settings saved', 'success');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'E-invoicing & e-way bill' }} />

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
        <SectionLabel>E-invoice</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <SwitchField
            label="Report invoices to the portal"
            description="B2B invoices and credit notes get an IRN and a signed QR."
            value={draft.eInvoiceEnabled}
            onValueChange={(v) => patch({ eInvoiceEnabled: v })}
          />
          <SwitchField
            label="Report on finalising"
            description="Generate the IRN as soon as an invoice is issued, without asking."
            value={draft.autoGenerateEInvoiceOnFinalise}
            onValueChange={(v) => patch({ autoGenerateEInvoiceOnFinalise: v })}
            disabled={!draft.eInvoiceEnabled}
          />
        </Card>

        <View style={{ height: t.spacing.md }} />

        <AmountField
          label="Aggregate annual turnover"
          value={turnover}
          onChangeValue={setTurnover}
          currency={currency}
          hint="What the business turns over in a year, across all its registrations."
        />
        <AmountField
          label="Mandatory above"
          value={threshold}
          onChangeValue={setThreshold}
          currency={currency}
          hint="E-invoicing has applied at 5 crore since August 2023."
        />
        <TextField
          label="Reporting window"
          value={String(draft.reportingWindowDays)}
          onChangeText={(v) => patch({ reportingWindowDays: Number(v) || 0 })}
          keyboardType="number-pad"
          suffix="days"
          hint="The portal refuses an invoice older than this."
        />

        <SectionLabel>Portal credentials</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <TextField
            label="Portal username"
            value={draft.irpUsername ?? ''}
            onChangeText={(v) => patch({ irpUsername: v })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="GSP client ID"
            value={draft.irpClientIdMasked ?? ''}
            onChangeText={(v) => patch({ irpClientIdMasked: v })}
            autoCapitalize="characters"
            autoCorrect={false}
            hint="Stored masked, and never sent anywhere. Do not put a real credential in a prototype."
          />
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
            <Text variant="caption" tone="muted" weight="600">
              Environment
            </Text>
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
        <SectionLabel>E-way bill</SectionLabel>
        <Card style={{ gap: t.spacing.sm }}>
          <SwitchField
            label="Raise e-way bills"
            description="For goods moving on an invoice or a delivery note."
            value={draft.ewayBillEnabled}
            onValueChange={(v) => patch({ ewayBillEnabled: v })}
          />
          <SwitchField
            label="Raise on finalising"
            description="Only possible when the defaults below are enough to fill Part-B; road consignments still need a vehicle number, so you will be prompted."
            value={draft.autoGenerateEwayBillOnFinalise}
            onValueChange={(v) => patch({ autoGenerateEwayBillOnFinalise: v })}
            disabled={!draft.ewayBillEnabled}
          />
        </Card>

        <View style={{ height: t.spacing.md }} />

        <AmountField
          label="Required above"
          value={ewayThreshold}
          onChangeValue={setEwayThreshold}
          currency={currency}
          hint="The statute sets 50,000. Several states set a higher figure for movement within the state."
        />
        <TextField
          label="Default transporter ID"
          value={draft.defaultTransporterId ?? ''}
          onChangeText={(v) => patch({ defaultTransporterId: v })}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextField
          label="Default transporter"
          value={draft.defaultTransporterName ?? ''}
          onChangeText={(v) => patch({ defaultTransporterName: v })}
        />
        <TextField
          label="Default distance"
          value={String(draft.defaultDistanceKm)}
          onChangeText={(v) => patch({ defaultDistanceKm: Number(v) || 0 })}
          keyboardType="number-pad"
          suffix="km"
        />

        <View style={{ gap: t.spacing.sm, marginBottom: t.spacing.md }}>
          <Text variant="caption" tone="muted" weight="600">
            Default mode
          </Text>
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
          <Text variant="caption" tone="muted" weight="600">
            Default cargo
          </Text>
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
        <SectionLabel>Where things stand</SectionLabel>
        <Card padded={false}>
          <ListRow
            title="Reported invoices"
            meta={String(summary.eInvoice.generated)}
            icon="shield-check-outline"
            divider
            onPress={() => router.push('/(app)/compliance')}
          />
          <ListRow
            title="Rejected or unreported"
            meta={String(summary.eInvoice.failed + summary.eInvoice.pending)}
            icon="alert-circle-outline"
            divider
            onPress={() => router.push('/(app)/compliance')}
          />
          <ListRow
            title="Active e-way bills"
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
        <Button title="Save" icon="check" onPress={onSave} fullWidth />
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
