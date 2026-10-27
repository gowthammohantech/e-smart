import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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

  // The portal logins are write-only: the server encrypts them and never returns them. The GSP's own client id
  // and secret are the server's (environment), not the business's, so they are never asked for here.
  //
  // The e-invoice (IRP) and e-way bill portals take separate logins, which need not match, so each is entered,
  // stored and tested on its own.
  const company = useActiveCompany();
  type Portal = 'einvoice' | 'ewaybill';
  // The integrations screen opens this on the tab of the portal being configured.
  const params = useLocalSearchParams<{ portal?: string }>();
  const routePortal: Portal = params.portal === 'ewaybill' ? 'ewaybill' : 'einvoice';
  // A tab picked by hand wins only while the route still asks for the portal it was picked under; opening the
  // screen again for the other portal starts on that one.
  const [picked, setPicked] = useState<{ from: Portal; portal: Portal } | null>(null);
  const portal: Portal = picked && picked.from === routePortal ? picked.portal : routePortal;

  // Only what has been typed lives here. Anything left alone follows what is saved, which arrives by sync and may
  // land after this screen opens. The password is never sent back, so a saved one is only ever shown as saved.
  const [edits, setEdits] = useState<Record<Portal, { username?: string; password: string }>>({
    einvoice: { password: '' },
    ewaybill: { password: '' },
  });
  const savedUsername = (portal === 'einvoice' ? stored.irpUsername : stored.ewbUsername) ?? '';
  const isSaved = savedUsername !== '';
  const login = { username: edits[portal].username ?? savedUsername, password: edits[portal].password };
  const setLogin = (over: Partial<{ username: string; password: string }>) =>
    setEdits((e) => ({ ...e, [portal]: { ...e[portal], ...over } }));

  const [credBusy, setCredBusy] = useState<'save' | 'test' | null>(null);
  const [credMessage, setCredMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const saveCredentials = async (): Promise<boolean> => {
    if (!company || !login.username.trim() || !login.password) {
      setCredMessage({ tone: 'bad', text: tr('compliance:settings.credentialsMissing') });
      return false;
    }
    setCredBusy('save');
    try {
      await compliance.saveCredentials(company.id, {
        portal,
        username: login.username.trim(),
        password: login.password,
      });
      setEdits((e) => ({ ...e, [portal]: { ...e[portal], password: '' } }));
      setCredMessage({ tone: 'good', text: tr('compliance:settings.credentialsSaved') });
      return true;
    } catch (err: unknown) {
      setCredMessage({ tone: 'bad', text: describeError(err, tr) });
      return false;
    } finally {
      setCredBusy(null);
    }
  };

  const testConnection = async () => {
    if (!company) return;
    // A password typed but not yet saved is saved first: the server tests what it has stored, so testing
    // without saving would check nothing and report "store the portal credentials first".
    if (login.password && !(await saveCredentials())) return;
    setCredBusy('test');
    compliance
      .testConnection(company.id)
      .then((r) => {
        // Both portals are checked, but the message leads with the one being edited.
        const mine = portal === 'einvoice' ? r.irp : r.ewb;
        const ok = !!mine?.ok;
        const line = (label: string, x?: { ok?: boolean; message?: string }) => `${label}: ${x?.message ?? (x?.ok ? 'OK' : '—')}`;
        const parts = [line('IRP', r.irp), line('EWB', r.ewb)];
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
          <Segmented
            options={[
              { value: 'einvoice', label: tr('compliance:settings.eInvoice') },
              { value: 'ewaybill', label: tr('compliance:settings.ewayBill') },
            ]}
            value={portal}
            onChange={(v) => {
              setPicked({ from: routePortal, portal: v });
              setCredMessage(null);
            }}
          />
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr(portal === 'einvoice' ? 'compliance:settings.loginForEinvoice' : 'compliance:settings.loginForEway')}
          </Text>
          <Text variant="caption" tone={isSaved ? 'good' : 'muted'} weight="600">
            {isSaved ? tr('compliance:settings.loginSaved', { username: savedUsername }) : tr('compliance:settings.loginNotSaved')}
          </Text>
          <TextField
            label={tr(portal === 'einvoice' ? 'compliance:settings.einvoiceUsername' : 'compliance:settings.ewayUsername')}
            value={login.username}
            onChangeText={(v) => setLogin({ username: v })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label={tr(portal === 'einvoice' ? 'compliance:settings.einvoicePassword' : 'compliance:settings.ewayPassword')}
            value={login.password}
            onChangeText={(v) => setLogin({ password: v })}
            placeholder={isSaved ? '••••••••' : undefined}
            hint={isSaved ? tr('compliance:settings.passwordSaved') : tr('compliance:settings.credentialHint')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.xs }}>
            <Button title={tr('compliance:settings.saveCredentials')} icon="lock-outline" loading={credBusy === 'save'} onPress={() => void saveCredentials()} />
            <Button title={tr('compliance:settings.testConnection')} variant="secondary" icon="lan-connect" loading={credBusy === 'test'} onPress={() => void testConnection()} />
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
