import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { ListRow } from '@esmart/ui/components/ListRow';
import { SwitchField } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { AccountSection } from './AccountSection';
import { SkeletonGroup, SkeletonRows } from '@esmart/ui/components/Skeleton';
import { api } from '../../remote/api';
import { describeError } from '../../remote/errors';
import { LoadFailed } from '../company/LoadFailed';
import { setOptedOut } from '../../lib/analytics';
import { LEGAL } from '../../lib/legal';
import { useAppStore } from '../../store/appStore';

/** "Share usage data": anonymous product analytics and crash reports, on unless the person turns it off. */
export function PrivacySection() {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'nav']);
  const toast = useToast();
  const userId = useAppStore((s) => s.session.userId);
  const demo = useAppStore((s) => !!s.session.demo);
  const [share, setShare] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.GET('/me/privacy-preferences').then(
      ({ data, error }) => (error ? setLoadFailed(true) : setShare(data?.shareUsageData ?? true)),
      () => setLoadFailed(true),
    );
  }, [attempt]);

  const toggle = (on: boolean) => {
    if (share === null) return;
    setShare(on);
    api
      .PUT('/me/privacy-preferences', { body: { shareUsageData: on } })
      .then(({ error }) => {
        if (error) throw error;
        setOptedOut(!on, userId ?? undefined);
      })
      .catch((err: unknown) => {
        setShare(share);
        toast.show(describeError(err, tr), 'error');
      });
  };

  const shareCard = demo ? (
    <Card>
      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('settings:privacy.demo')}</Text>
    </Card>
  ) : share !== null ? (
    <Card style={{ gap: t.spacing.sm }}>
      <SwitchField label={tr('settings:privacy.shareUsage')} value={share} onValueChange={toggle} />
      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('settings:privacy.shareUsageHint')}</Text>
    </Card>
  ) : loadFailed ? (
    <Card padded={false}>
      <LoadFailed
        onRetry={() => {
          setLoadFailed(false);
          setAttempt((n) => n + 1);
        }}
        compact
      />
    </Card>
  ) : (
    <Card>
      <SkeletonGroup>
        <SkeletonRows rows={1} kind="list" />
      </SkeletonGroup>
    </Card>
  );

  const about = (
    <>
      <Card variant="flat" style={{ gap: t.spacing.sm }}>
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:privacy.whatHeading')}</Text>
        <Text variant="caption" tone="muted" style={{ lineHeight: 19 }}>{tr('settings:privacy.what')}</Text>
      </Card>
      <Card padded={false}>
        <ListRow title={tr('settings:about.privacy')} icon="shield-account-outline" chevron onPress={() => void Linking.openURL(LEGAL.privacy).catch(() => toast.show(LEGAL.privacy, 'info', { icon: 'link-variant' }))} divider={false} />
      </Card>
    </>
  );

  return (
    <AccountSection title={tr('nav:more.entry.privacy')}>
      {/* Stacked: on a desktop it already sits in half the page, beside sign-in security. */}
      {shareCard}
      {about}
    </AccountSection>
  );
}
