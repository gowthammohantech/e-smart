import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { acceptOffline, declineOffline, onRefusedLater, onUnconfirmed, useConnectivity } from '../remote';

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
    // A change kept on this device and refused once sent: it waits in Settings → Sync to be fixed or discarded.
    const refusedLater = (label: string, reason: string) =>
      toast.show(tr('common:save.refusedLater', { label, reason }), 'error', { icon: 'cloud-alert-outline' });
    onUnconfirmed.add(show);
    onRefusedLater.add(refusedLater);
    return () => {
      onUnconfirmed.delete(show);
      onRefusedLater.delete(refusedLater);
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
