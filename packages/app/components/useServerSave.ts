import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import { useSaveOnline, type SaveResult } from '../remote/save';

/**
 * A save from a screen: online it waits for the server and says what it
 * answered; offline it says the change is kept on this device. Resolves with
 * the result, or undefined when the server refused (and the change was undone).
 */
export function useServerSave() {
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  const { save, saving } = useSaveOnline();
  const run = useCallback(
    async <T>(action: () => T, success?: string): Promise<SaveResult<T> | undefined> => {
      const res = await save(action);
      if (res.outcome === 'refused') {
        toast.show(tr('common:save.refused', { reason: res.error }), 'error');
        return undefined;
      }
      if (res.outcome === 'queued') toast.show(tr('common:save.queued'), 'success');
      else if (success) toast.show(success, 'success');
      return res;
    },
    [save, toast, tr],
  );
  return { run, saving };
}
