import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useComplianceSettings } from '../../store/selectors';

/**
 * The way into a new e-way bill. The e-way bill portal takes its own login (not the e-invoice one), and a
 * bill raised without it is refused only after the whole form is filled. So with no login saved, the person
 * is told first and taken to where it is set. Render `dialog` once beside the button that calls `open`.
 */
export function useEwayLoginGate() {
  const { t: tr } = useTranslation(['compliance']);
  const router = useRouter();
  const settings = useComplianceSettings();
  const [asking, setAsking] = useState(false);
  // A portal has a login once its username is saved (the password is never sent back).
  const hasLogin = !!settings.ewbUsername;

  const open = (documentId: string) => {
    if (!hasLogin) {
      setAsking(true);
      return;
    }
    router.push(`/(app)/compliance/eway/new?documentId=${documentId}` as never);
  };

  const dialog = (
    <ConfirmDialog
      visible={asking}
      title={tr('compliance:ewb.loginMissingTitle')}
      message={tr('compliance:ewb.loginMissingBody')}
      confirmLabel={tr('compliance:ewb.loginMissingConfirm')}
      icon="truck-fast-outline"
      onCancel={() => setAsking(false)}
      onConfirm={() => {
        setAsking(false);
        router.push({ pathname: '/(app)/settings/e-invoicing', params: { portal: 'ewaybill' } } as never);
      }}
    />
  );
  return { open, dialog, hasLogin };
}
