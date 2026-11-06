import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast, type ToastOptions } from '@esmart/ui/components/Toast';
import { useCanWrite } from '../remote/connectivity';
import { useSaveOnline, type SaveResult } from '../remote/save';

/**
 * A save from a screen: online it waits for the server and says what it
 * answered; in offline mode it says the change is kept on this device.
 * Resolves with the result, or undefined when nothing was saved: the server
 * refused, or couldn't be reached (and the change was undone).
 */
export function useServerSave() {
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  const { save, saving } = useSaveOnline();
  // View-only: the save button is greyed out; the header's badge offers offline mode.
  const blocked = !useCanWrite();
  const run = useCallback(
    async <T>(action: () => T, success?: string, options?: ToastOptions): Promise<SaveResult<T> | undefined> => {
      const res = await save(action);
      // Not refused: kept for an owner or admin to approve (RULES 6.14).
      if (res.outcome === 'refused' && res.errorCode === 'PAYMENT_HELD') {
        toast.show(tr('common:save.paymentHeld'), 'info', { icon: 'clipboard-clock-outline' });
        return undefined;
      }
      if (res.outcome === 'refused') {
        toast.show(tr('common:save.refused', { reason: res.error }), 'error');
        return undefined;
      }
      if (res.outcome === 'unreachable' || res.outcome === 'unconfirmed') {
        toast.show(tr(`common:save.${res.outcome}`), 'error');
        return undefined;
      }
      if (res.outcome === 'queued') toast.show(tr('common:save.queued'), 'success');
      else if (success) toast.show(success, 'success', options);
      return res;
    },
    [save, toast, tr],
  );
  return { run, saving, blocked };
}
