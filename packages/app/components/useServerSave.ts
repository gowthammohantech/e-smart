import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast, type ToastOptions } from '@esmart/ui/components/Toast';
import { useCanWrite } from '../remote/connectivity';
import { useSaveOnline, type SaveResult } from '../remote/save';

/**
 * A save from a screen: it waits for the server and says what it answered.
 * Resolves with the result, or undefined when nothing was saved: the server
 * refused, or couldn't be reached (and the change was undone), or another
 * save from the same screen was still running (a double tap).
 * `hold: true` keeps the button busy after a save that went through, for a
 * form that leaves once it has created something; `release` lets it go.
 */
export function useServerSave() {
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  const { save, saving, release } = useSaveOnline();
  // No connection: the save button is greyed out and the header says so.
  const blocked = !useCanWrite();
  const run = useCallback(
    async <T>(action: () => T, success?: string, options?: ToastOptions & { hold?: boolean }): Promise<SaveResult<T> | undefined> => {
      const { hold, ...toastOptions } = options ?? {};
      const res = await save(action, { hold });
      // Another save from this screen is still running: this tap did nothing.
      if (!res) return undefined;
      // Not refused: kept for an owner or admin to approve (RULES 6.14).
      if (res.outcome === 'refused' && res.errorCode === 'PAYMENT_HELD') {
        toast.show(tr('common:save.paymentHeld'), 'info', { icon: 'clipboard-clock-outline' });
        return undefined;
      }
      if (res.outcome === 'refused') {
        toast.show(tr('common:save.refused', { reason: res.error }), 'error');
        return undefined;
      }
      if (res.outcome === 'unreachable') {
        toast.show(tr('common:save.unreachable'), 'error');
        return undefined;
      }
      if (success) toast.show(success, 'success', toastOptions);
      return res;
    },
    [save, toast, tr],
  );
  return { run, saving, blocked, release };
}
