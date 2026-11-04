import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { acceptOffline, declineOffline, onUnconfirmed, useConnectivity } from '../remote';

/**
 * Asks, once the connection has been gone a while, whether to keep working on
 * this device (connectivity.ts). Also says so when a change made outside a
 * form's save (a toggle, a delete) couldn't be confirmed and was undone.
 */
export function OfflinePrompt() {
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  const open = useConnectivity((s) => s.promptOpen);

  useEffect(() => {
    const show = (r: { outcome: string; error?: string }) =>
      toast.show(r.outcome === 'refused' ? tr('common:save.refused', { reason: r.error }) : tr(r.outcome === 'unconfirmed' ? 'common:save.unconfirmed' : 'common:save.unreachable'), 'error');
    onUnconfirmed.add(show);
    return () => {
      onUnconfirmed.delete(show);
    };
  }, [toast, tr]);

  return (
    <ConfirmDialog
      visible={open}
      icon="cloud-off-outline"
      title={tr('common:offlineMode.title')}
      message={tr('common:offlineMode.message')}
      confirmLabel={tr('common:offlineMode.accept')}
      cancelLabel={tr('common:offlineMode.decline')}
      onConfirm={acceptOffline}
      onCancel={declineOffline}
    />
  );
}
