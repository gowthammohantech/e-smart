import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { ListRow } from '@esmart/ui/components/ListRow';
import { AmountField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { ComplianceSettings, TransportMode, VehicleType } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { compliance } from '../../../remote';
import { describeError } from '../../../remote/errors';
import { useActiveCompany, useBaseCurrency, useComplianceSettings, useComplianceSummary } from '../../../store/selectors';
import { fromMajor, toMajor } from '@esmart/core/lib/money';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

export default function EInvoicingSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['compliance', 'nav', 'auth']);
  const router = useRouter();
  const toast = useToast();
  // Always false in the native apps, so the desktop header action only ever reaches a browser.
  const desktop = useIsDesktop();

  const stored = useComplianceSettings();
  const currency = useBaseCurrency();
  const summary = useComplianceSummary();
  const save = useAppStore((s) => s.saveComplianceSettings);

  const [draft, setDraft] = useState<ComplianceSettings>(stored);
  const [turnover, setTurnover] = useState(String(toMajor(stored.annualTurnover)));
  const [threshold, setThreshold] = useState(String(toMajor(stored.eInvoiceTurnoverThreshold)));
  const [ewayThreshold, setEwayThreshold] = useState(String(toMajor(stored.ewayBillThreshold)));

  const patch = (over: Partial<ComplianceSettings>) => setDraft((d) => ({ ...d, ...over }));

  // Portal credentials are write-only: the server encrypts them and only ever shows the masked client id.
  const company = useActiveCompany();
  const [cred, setCred] = useState({ gspProvider: '', username: stored.irpUsername ?? '', password: '', clientId: '', clientSecret: '' });
  const [credBusy, setCredBusy] = useState<'save' | 'test' | null>(null);
  const [credMessage, setCredMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const saveCredentials = () => {
    if (!company || !cred.username.trim() || !cred.password) {
      setCredMessage({ tone: 'bad', text: tr('compliance:settings.credentialsMissing') });
      return;
    }
    setCredBusy('save');
    compliance
      .saveCredentials(company.id, {
        environment: draft.irpEnvironment,
        username: cred.username.trim(),
        password: cred.password,
        gspProvider: cred.gspProvider.trim() || undefined,
        clientId: cred.clientId.trim() || undefined,
        clientSecret: cred.clientSecret || undefined,
      })
      .then(() => {
        setCred((c) => ({ ...c, password: '', clientId: '', clientSecret: '' }));
        setCredMessage({ tone: 'good', text: tr('compliance:settings.credentialsSaved') });
      })
      .catch((err: unknown) => setCredMessage({ tone: 'bad', text: describeError(err, tr) }))
      .finally(() => setCredBusy(null));
  };

  const testConnection = () => {
    if (!company) return;
    setCredBusy('test');
    compliance
      .testConnection(company.id)
      .then((r) => {
        const ok = !!r.irp?.ok && !!r.ewb?.ok;
        const parts = [`IRP: ${r.irp?.message ?? (r.irp?.ok ? 'OK' : '—')}`, `EWB: ${r.ewb?.message ?? (r.ewb?.ok ? 'OK' : '—')}`];
        setCredMessage({ tone: ok ? 'good' : 'bad', text: `${ok ? tr('compliance:settings.connectionOk') : tr('compliance:settings.connectionFailed')} ${parts.join(' · ')}` });
      })
      .catch((err: unknown) => setCredMessage({ tone: 'bad', text: describeError(err, tr) }))
      .finally(() => setCredBusy(null));
  };

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
      <Stack.Screen
        options={
          desktop
            ? // A desktop puts Save with the page title, top right, instead of a bar at the bottom.
              {
                title: tr('nav:title.eInvoicingAndEWayBill'),
                headerRight: () => <Button title={tr('compliance:settings.save')} icon="check" onPress={onSave} />,
              }
            : { title: tr('nav:title.eInvoicingAndEWayBill') }
        }
      />

      <ScrollView
        contentContainerStyle={desktop ? { padding: t.spacing.lg, paddingBottom: t.spacing.xxxl } : { padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        keyboardShouldPersistTaps="handled"
      >
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
            label={tr('compliance:settings.gspProvider')}
            value={cred.gspProvider}
            onChangeText={(v) => setCred((c) => ({ ...c, gspProvider: v }))}
            placeholder="cleartax, masters-india, nic-direct"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label={tr('compliance:settings.portalUsername')}
            value={cred.username}
            onChangeText={(v) => setCred((c) => ({ ...c, username: v }))}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label={tr('compliance:settings.portalPassword')}
            value={cred.password}
            onChangeText={(v) => setCred((c) => ({ ...c, password: v }))}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label={tr('compliance:settings.gspClientId')}
            value={cred.clientId}
            onChangeText={(v) => setCred((c) => ({ ...c, clientId: v }))}
            placeholder={stored.irpClientIdMasked ?? undefined}
            autoCapitalize="none"
            autoCorrect={false}
            hint={stored.irpClientIdMasked ? tr('compliance:settings.storedClientId', { masked: stored.irpClientIdMasked }) : tr('compliance:settings.credentialHint')}
          />
          <TextField
            label={tr('compliance:settings.gspClientSecret')}
            value={cred.clientSecret}
            onChangeText={(v) => setCred((c) => ({ ...c, clientSecret: v }))}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
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
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.xs }}>
            <Button title={tr('compliance:settings.saveCredentials')} icon="lock-outline" loading={credBusy === 'save'} onPress={saveCredentials} />
            <Button title={tr('compliance:settings.testConnection')} variant="secondary" icon="lan-connect" loading={credBusy === 'test'} onPress={testConnection} />
          </View>
          {credMessage ? (
            <Text variant="caption" tone={credMessage.tone} style={{ lineHeight: 18 }}>
              {credMessage.text}
            </Text>
          ) : null}
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

      {desktop ? null : (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: t.spacing.lg,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
          }}
        >
          <Button title={tr('compliance:settings.save')} icon="check" onPress={onSave} fullWidth />
        </View>
      )}
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
