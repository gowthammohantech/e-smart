import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import { onUnconfirmed } from '../remote';

/**
 * Says so when a change made outside a form's save (a toggle, a delete) was refused or couldn't reach
 * the server, and was undone. Mounted once at the root.
 */
export function SaveToasts() {
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  useEffect(() => {
    const show = (r: { outcome: string; error?: string }) =>
      toast.show(r.outcome === 'refused' ? tr('common:save.refused', { reason: r.error }) : tr('common:save.unreachable'), 'error');
    onUnconfirmed.add(show);
    return () => {
      onUnconfirmed.delete(show);
    };
  }, [toast, tr]);
  return null;
}
