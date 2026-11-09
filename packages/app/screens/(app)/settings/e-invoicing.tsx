import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { formatGstin } from '@esmart/core/domain/gstin';
import { ListRow } from '@esmart/ui/components/ListRow';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { ComplianceSettings, TransportMode, VehicleType } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { compliance } from '../../../remote';
import { describeError } from '../../../remote/errors';
import { useActiveCompany, useBaseCurrency, useComplianceSettings, useComplianceSummary, useSetupReady, useTransporters } from '../../../store/selectors';
import { LoadingView } from '../../../components/LoadingView';
import { fromMajor, toMajor } from '@esmart/core/lib/money';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useServerSave } from '../../../components/useServerSave';

/**
 * The form starts from the business's saved settings, so it waits for them: drawn from the defaults
 * it would save those over the real ones. Keyed by business, so a switch starts it again.
 */
export default function EInvoicingSettings() {
  const { t: tr } = useTranslation(['nav']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const ready = useSetupReady();
  if (!ready) return <LoadingView variant="form" title={tr('nav:title.eInvoicingAndEWayBill')} />;
  return <EInvoicingForm key={companyId} />;
}

function EInvoicingForm() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav', 'auth', 'settings']);
  const router = useRouter();
  const { run: serverSave, saving } = useServerSave();
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
  // The default transporter is picked from the Transporters master, so its 15-character ID is always a valid one.
  const transporters = useTransporters().filter((x) => x.status !== 'inactive');
  const [transporterOpen, setTransporterOpen] = useState(false);

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
  // A login saved here counts as saved before sync brings the username back.
  const [savedHere, setSavedHere] = useState<Record<Portal, string>>({ einvoice: '', ewaybill: '' });
  const savedUsername = (portal === 'einvoice' ? stored.irpUsername : stored.ewbUsername) || savedHere[portal];
  const isSaved = savedUsername !== '';
  const login = { username: edits[portal].username ?? savedUsername, password: edits[portal].password };
  const setLogin = (over: Partial<{ username: string; password: string }>) =>
    setEdits((e) => ({ ...e, [portal]: { ...e[portal], ...over } }));

  const [credBusy, setCredBusy] = useState<'save' | 'test' | null>(null);
  const [credMessage, setCredMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const saveCredentials = async (): Promise<boolean> => {
    // Saving again with nothing new: the stored login stands (the password is never shown, so it is not retyped).
    if (company && isSaved && !login.password && login.username.trim() === savedUsername) {
      setCredMessage({ tone: 'good', text: tr('compliance:settings.credentialsUnchanged') });
      return true;
    }
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
      setSavedHere((s) => ({ ...s, [portal]: login.username.trim() }));
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

  // A login typed here is saved with everything else by the one Save: no separate "Save login".
  const loginEdited = !!login.password || (!!login.username.trim() && login.username.trim() !== savedUsername);

  const onSave = async () => {
    if (loginEdited && !(await saveCredentials())) return;
    const settings = {
      ...draft,
      annualTurnover: fromMajor(turnover || '0', currency),
      eInvoiceTurnoverThreshold: fromMajor(threshold || '0', currency),
      ewayBillThreshold: fromMajor(ewayThreshold || '0', currency),
    };
    await serverSave(() => save(settings), tr('compliance:settings.saved'), { icon: 'shield-check-outline' });
  };

  // Ctrl+S (⌘+S) does what Save does.
  useSaveShortcut(onSave);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.eInvoicingAndEWayBill') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
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
          suffix={tr('settings:eInvoicing.daysSuffix')}
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
        <PickerField
          label={tr('compliance:settings.defaultTransporter')}
          value={
            draft.defaultTransporterId
              ? `${draft.defaultTransporterName || transporters.find((x) => x.transporterId === draft.defaultTransporterId)?.name || ''} · ${formatGstin(draft.defaultTransporterId)}`.replace(/^ · /, '')
              : undefined
          }
          placeholder={tr('settings:eInvoicing.noTransporter')}
          onPress={() => setTransporterOpen(true)}
          icon="truck-outline"
          hint={transporters.length ? tr('settings:eInvoicing.transporterHint') : tr('settings:eInvoicing.noTransportersHint')}
          clearable={!!draft.defaultTransporterId}
          onClear={() => patch({ defaultTransporterId: undefined, defaultTransporterName: undefined })}
        />
        <TextField
          label={tr('compliance:settings.defaultDistance')}
          value={String(draft.defaultDistanceKm)}
          onChangeText={(v) => patch({ defaultDistanceKm: Number(v) || 0 })}
          keyboardType="number-pad"
          suffix={tr('compliance:ewb.km')}
        />

        <View style={{ gap: t.spacing.sm, marginBottom: t.spacing.md }}>
          <Text variant="caption" tone="muted" weight="600">{tr('compliance:settings.defaultMode')}</Text>
          <Segmented
            options={[
              { value: 'road', label: tr('compliance:mode.road') },
              { value: 'rail', label: tr('compliance:mode.rail') },
              { value: 'air', label: tr('compliance:mode.air') },
              { value: 'ship', label: tr('compliance:mode.ship') },
            ]}
            value={draft.defaultTransportMode}
            onChange={(v: TransportMode) => patch({ defaultTransportMode: v })}
          />
        </View>

        <View style={{ gap: t.spacing.sm }}>
          <Text variant="caption" tone="muted" weight="600">{tr('compliance:settings.defaultCargo')}</Text>
          <Segmented
            options={[
              { value: 'regular', label: tr('compliance:cargo.regular') },
              { value: 'overDimensional', label: tr('compliance:cargo.overDimensional') },
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

      {/* The bar under the form, in the flow so the keyboard lifts it and it never covers the last fields. */}
      <FormActions>
        <Button
          shortcut="S"
          title={tr('compliance:settings.save')}
          icon="check"
          onPress={onSave}
          loading={saving || credBusy === 'save'}
          disabled={saving || credBusy !== null}
          fullWidth={!desktop}
          size={desktop ? undefined : 'lg'}
        />
      </FormActions>

      <SelectSheet
        visible={transporterOpen}
        onClose={() => setTransporterOpen(false)}
        title={tr('compliance:settings.defaultTransporter')}
        options={transporters.map((x) => ({ value: x.transporterId, label: x.name, description: formatGstin(x.transporterId) }))}
        value={draft.defaultTransporterId ?? null}
        onSelect={(id) => patch({ defaultTransporterId: id, defaultTransporterName: transporters.find((x) => x.transporterId === id)?.name })}
        emptyMessage={tr('settings:eInvoicing.noTransportersHint')}
        footer={
          <Button
            title={tr('settings:transporters.add')}
            icon="plus"
            variant="ghost"
            fullWidth
            onPress={() => {
              setTransporterOpen(false);
              router.push('/(app)/settings/transporters');
            }}
          />
        }
      />
    </KeyboardAvoidingView>
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
