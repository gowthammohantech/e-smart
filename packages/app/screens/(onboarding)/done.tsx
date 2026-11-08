import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useToast } from '@esmart/ui/components/Toast';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useAppStore } from '../../store/appStore';
import { setLocalLogo, uploadLogo } from '../../remote/logo';
import { saveOnline } from '../../remote/save';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { useOnboardingStore } from '../../store/onboardingStore';
import { COUNTRIES } from '@esmart/core/data/masters';
import { joinPhone } from '@esmart/core/lib/phone';

const NEXT_STEPS: { icon: IconName; labelKey: string; bodyKey: string }[] = [
  { icon: 'account-plus-outline', labelKey: 'customersLabel', bodyKey: 'customersBody' },
  { icon: 'tag-outline', labelKey: 'itemsLabel', bodyKey: 'itemsBody' },
  { icon: 'file-document-outline', labelKey: 'invoiceLabel', bodyKey: 'invoiceBody' },
];

export default function Done() {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding', 'common', 'settings']);
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { draft, reset } = useOnboardingStore();
  const [busy, setBusy] = useState(false);

  const createCompany = useAppStore((s) => s.createCompany);
  const numberingSeries = useAppStore((s) => s.numberingSeries);
  const saveNumberingSeries = useAppStore((s) => s.saveNumberingSeries);

  // Read at once, not after a re-render: a double tap would create the business twice.
  const finished = useRef(false);
  // The business the server already made: a retry after the last step failed doesn't make a second.
  const created = useRef<string | null>(null);
  const finish = async (goToInvoice: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setBusy(true);
    if (!created.current && !(await createBusiness())) return;
    // Waited for: a launch that finds setup unfinished on the server sends the owner through it again.
    try {
      await api.POST('/me/onboarding/complete', {});
    } catch (err) {
      finished.current = false;
      setBusy(false);
      toast.show(describeError(err, tr) || tr('common:save.unreachable'), 'error');
      return;
    }
    useAppStore.setState((s) => ({ session: { ...s.session, onboardingComplete: true } }));
    reset();
    toast.show(tr('onboarding:done.created'), 'success', { icon: 'store-check-outline', detail: draft.name || tr('onboarding:done.defaultName') });
    router.replace(goToInvoice ? '/(app)/sales/invoices/new' : '/(app)/(tabs)');
  };

  const createBusiness = async (): Promise<boolean> => {
    const country = COUNTRIES.find((c) => c.code === draft.country);

    // One save: the business, then its invoice numbering, which goes once the server has made the business.
    const res = await saveOnline(() => {
      const companyId = createCompany({
        name: draft.name || tr('onboarding:done.defaultName'),
        legalName: draft.legalName || undefined,
        logoUri: draft.logoUri,
        businessType: draft.businessType,
        // Free only for now, whatever an older saved draft says.
        plan: 'free',
        country: draft.country,
        baseCurrency: draft.baseCurrency,
        address: draft.address,
        email: draft.email || undefined,
        phone: joinPhone(draft.phoneDialCode, draft.phone) || undefined,
        fiscalYearStartMonth: draft.fiscalYearStartMonth,
        taxRegistration: {
          regime: country?.regime ?? 'NONE',
          identifier: draft.taxIdentifier || undefined,
          identifierLabel: country?.taxIdLabel ?? tr('onboarding:done.defaultTaxLabel'),
          registered: draft.taxRegistered,
          compositionScheme: draft.compositionScheme,
          placeOfSupplyStateCode: draft.address.stateCode,
        },
      });

      // Apply the numbering choices to the newly created invoice series.
      const series = useAppStore
        .getState()
        .numberingSeries.find((s) => s.companyId === companyId && s.kind === 'invoice');
      if (series) {
        saveNumberingSeries({
          ...series,
          prefix: draft.invoicePrefix || 'INV',
          nextNumber: Number(draft.invoiceNextNumber) || 1,
          includeFiscalYear: draft.includeFiscalYear,
        });
      }
      return companyId;
    });
    void numberingSeries;
    if (res.outcome !== 'saved' || !res.id) {
      finished.current = false;
      setBusy(false);
      toast.show(res.outcome === 'refused' ? tr('common:save.refused', { reason: res.error }) : tr('common:save.unreachable'), 'error');
      return false;
    }
    created.current = res.id;
    // The logo goes up once the business is on the server; one that fails can be added again in the profile.
    if (draft.logoUri) {
      const companyId = res.id;
      setLocalLogo(companyId, draft.logoUri);
      void uploadLogo(companyId, draft.logoUri).catch(() => {
        setLocalLogo(companyId, undefined);
        toast.show(tr('settings:company.logoFailed', { reason: '' }), 'error');
      });
    }

    return true;
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.c.bg,
        paddingTop: insets.top + t.spacing.xxxl,
        paddingHorizontal: t.spacing.xl,
        paddingBottom: insets.bottom + t.spacing.xl,
        // A desktop centres the page at a readable width instead of pinning
        // the buttons to the bottom of a tall window.
        ...(desktop ? { alignItems: 'center', justifyContent: 'center' } : null),
      }}
    >
      <View style={desktop ? { width: '100%', maxWidth: 640, gap: t.spacing.xxl } : { flex: 1, gap: t.spacing.xxl }}>
        <View style={{ alignItems: 'center', gap: t.spacing.lg }}>
          <Illustration name="setup-complete" size="hero" />
          <View style={{ gap: 6 }}>
            <Text variant="h2" center>
              {tr('onboarding:done.readyTitle', { business: draft.name || tr('onboarding:done.fallbackBusiness') })}
            </Text>
            <Text variant="small" tone="muted" center style={{ lineHeight: 20 }}>{tr('onboarding:done.allSet')}</Text>
          </View>
        </View>

        <View style={{ gap: t.spacing.md }}>
          {NEXT_STEPS.map((s) => (
            <Card key={s.labelKey} variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.sm,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={s.icon} size={19} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600">
                  {tr(`onboarding:done.next.${s.labelKey}` as 'onboarding:done.next.customersLabel')}
                </Text>
                <Text variant="caption" tone="muted">
                  {tr(`onboarding:done.next.${s.bodyKey}` as 'onboarding:done.next.customersBody')}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      <View
        style={
          desktop
            ? { width: '100%', maxWidth: 640, flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.md, marginTop: t.spacing.xxl }
            : { gap: t.spacing.md }
        }
      >
        {desktop ? (
          <>
            <Button title={tr('onboarding:done.goToDashboard')} variant="ghost" onPress={() => finish(false)} disabled={busy} />
            <Button title={tr('onboarding:done.createInvoice')} onPress={() => finish(true)} loading={busy} iconRight="arrow-right" />
          </>
        ) : (
          <>
            <Button title={tr('onboarding:done.createInvoice')} onPress={() => finish(true)} loading={busy} fullWidth />
            <Button title={tr('onboarding:done.goToDashboard')} variant="ghost" onPress={() => finish(false)} disabled={busy} fullWidth />
          </>
        )}
      </View>
    </View>
  );
}
