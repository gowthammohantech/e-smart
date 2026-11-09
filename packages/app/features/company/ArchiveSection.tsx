import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@esmart/ui/components/Card';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { formatDate } from '@esmart/core/lib/date';
import { describeError } from '../../remote/errors';
import { restoreCompany, useArchivedCompanies } from '../../remote/archive';
import { useAppStore } from '../../store/appStore';
import { useActiveCompany, useCurrentUser } from '../../store/selectors';
import { ArchiveCompanySheet } from './ArchiveCompanySheet';
import { CardRowsSkeleton } from '../../components/ScreenSkeleton';

/**
 * The end of the business profile, for the account's owner: archive this business (while another
 * stays open), and the businesses archived before, each with Restore.
 */
export function ArchiveSection() {
  const { t: tr } = useTranslation(['settings']);
  const toast = useToast();
  const company = useActiveCompany();
  const user = useCurrentUser();
  const accountId = useAppStore((s) => s.accountId);
  const openOnAccount = useAppStore((s) => s.companies.filter((c) => c.accountId === s.accountId).length);
  const owner = user?.role === 'owner';
  const archivedQuery = useArchivedCompanies(owner);
  const archived = archivedQuery.data ?? [];
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  if (!company || !owner) return null;
  // A business shared from another account is that account's to close.
  const ours = !accountId || company.accountId === accountId;

  const restore = async (id: string, name: string) => {
    setRestoring(id);
    try {
      await restoreCompany(id);
      toast.show(tr('settings:archiveCompany.restored'), 'success', { icon: 'archive-arrow-up-outline', detail: name });
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {tr('settings:archiveCompany.section')}
      </Text>
      {/* While the list is fetched: a placeholder rather than rows popping in under the button. */}
      {archivedQuery.isLoading ? (
        <Card padded={false}>
          <CardRowsSkeleton kind="list" rows={1} />
        </Card>
      ) : archived.length ? (
        <Card padded={false}>
          {archived.map((c, i) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={tr('settings:archiveCompany.archivedOn', {
                date: c.archivedAt ? formatDate(c.archivedAt.slice(0, 10)) : '',
                purge: c.purgeAfter ? formatDate(c.purgeAfter.slice(0, 10)) : '',
              })}
              icon="archive-outline"
              divider={i < archived.length - 1}
              right={
                <Button
                  title={tr('settings:archiveCompany.restore')}
                  variant="secondary"
                  size="sm"
                  loading={restoring === c.id}
                  disabled={!!restoring}
                  onPress={() => void restore(c.id!, c.name)}
                />
              }
            />
          ))}
        </Card>
      ) : null}
      {ours ? (
        <Card padded={false}>
          <ListRow
            title={tr('settings:archiveCompany.row')}
            subtitle={openOnAccount > 1 ? tr('settings:archiveCompany.rowHint') : tr('settings:archiveCompany.lastCompany')}
            icon="archive-outline"
            destructive
            disabled={openOnAccount <= 1}
            divider={false}
            onPress={() => setArchiving(true)}
          />
        </Card>
      ) : null}
      <ArchiveCompanySheet company={company} visible={archiving} onClose={() => setArchiving(false)} />
    </>
  );
}
