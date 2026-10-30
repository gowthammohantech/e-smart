import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../store/appStore';
import { remoteSession, retrySync, syncAll, syncNow } from '../../remote';
import { describeError } from '../../remote/errors';

const waiting = () => useAppStore.getState().syncQueue.filter((q) => q.status !== 'synced').length;

/**
 * Settings → Sync's buttons under a promise toast. A run that could not reach
 * the server still finishes, so what is left in the queue decides whether it
 * reads as done or as "still waiting".
 */
export function useSyncToasts() {
  const { t: tr } = useTranslation(['settings', 'errors']);
  const toast = useToast();

  const settled = () => {
    const left = waiting();
    if (left) throw new Error(tr('settings:sync.stillWaiting', { count: left }));
  };
  const run = (task: Promise<void>) =>
    toast
      .promise(task.then(settled), {
        loading: tr('settings:sync.syncing'),
        success: tr('settings:sync.allSynced'),
        error: (err) => (err instanceof Error ? err.message : describeError(err, tr)),
        icon: 'cloud-check-outline',
      })
      .catch(() => {});

  return {
    /** Sync now, and "Retry all": failed changes go again along with pending ones. */
    syncEverything: () => run(syncAll()),
    /** One failed or conflicted change, sent again. */
    retryOne: (id: string) => {
      retrySync(id);
      return run(syncNow());
    },
    reload: () =>
      toast
        .promise(syncNow().then(remoteSession.resync), {
          loading: tr('settings:sync.reloading'),
          success: tr('settings:sync.reloaded'),
          error: (err) => describeError(err, tr),
          icon: 'cloud-download-outline',
        })
        .catch(() => {}),
  };
}
