import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { formatDate } from '@esmart/core/lib/date';
import type { BusinessDocument } from '@esmart/core/types';
import { api } from '../../remote/api';
import { applyEntity } from '../../remote/apply';
import { describeError } from '../../remote/errors';
import { queryClient } from '../../remote/queries';
import { useAppStore } from '../../store/appStore';
import { useCurrentUser } from '../../store/selectors';

const APPROVERS = ['owner', 'admin'];

/** Approve a waiting document (which issues it) or send it back with why; from the server, as it decides. */
export function useApprovalActions() {
  const companyId = useAppStore((s) => s.activeCompanyId);
  const after = (data: unknown) => {
    applyEntity('document', data);
    void queryClient.invalidateQueries({ queryKey: ['approvals', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['documents', companyId] });
  };
  return {
    approve: async (id: string) => {
      const { data, error } = await api.POST('/companies/{companyId}/documents/{id}/approve', { params: { path: { companyId, id } } });
      if (error || !data) throw error;
      after(data);
      return data;
    },
    reject: async (id: string, note: string) => {
      const { data, error } = await api.POST('/companies/{companyId}/documents/{id}/reject', { params: { path: { companyId, id } }, body: { note } });
      if (error || !data) throw error;
      after(data);
      return data;
    },
  };
}

/**
 * On a document sent for approval: that it is waiting (with the owner's or admin's buttons), or that
 * it was sent back and why.
 */
export function ApprovalBanner({ doc }: { doc: BusinessDocument }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const toast = useToast();
  const { t: tr } = useTranslation(['sales']);
  const user = useCurrentUser();
  const { approve, reject } = useApprovalActions();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const approval = doc.approval;
  if (!approval || approval.status === 'approved' || doc.status !== 'draft') return null;
  const canDecide = APPROVERS.includes(user?.role ?? '');

  const run = async (job: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await job();
      toast.show(done, 'success', { icon: 'check', detail: doc.number });
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: t.spacing.sm, borderLeftWidth: 3, borderLeftColor: approval.status === 'pending' ? t.c.warn : t.c.bad }}>
      <Text variant="body" weight="600">
        {approval.status === 'pending' ? tr('sales:approval.pending') : tr('sales:approval.rejected')}
      </Text>
      <Text variant="small" tone="muted">
        {approval.status === 'pending'
          ? tr('sales:approval.pendingBody', { date: approval.requestedAt ? formatDate(approval.requestedAt.slice(0, 10)) : '' })
          : tr('sales:approval.rejectedBody', { note: approval.note ?? '' })}
      </Text>
      {approval.status === 'pending' && canDecide ? (
        rejecting ? (
          <View style={{ gap: t.spacing.sm }}>
            <TextField label={tr('sales:approval.why')} value={note} onChangeText={setNote} multiline />
            {/* A desktop keeps the pair at its own width at the right; a phone splits the row. */}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, justifyContent: desktop ? 'flex-end' : undefined }}>
              <Button title={tr('sales:approval.cancel')} variant="ghost" onPress={() => setRejecting(false)} style={desktop ? undefined : { flex: 1 }} />
              <Button title={tr('sales:approval.sendBack')} variant="danger" onPress={() => void run(() => reject(doc.id, note.trim()), tr('sales:approval.sentBack'))} loading={busy} disabled={busy || !note.trim()} style={desktop ? undefined : { flex: 1 }} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, justifyContent: desktop ? 'flex-end' : undefined }}>
            <Button title={tr('sales:approval.reject')} variant="secondary" onPress={() => setRejecting(true)} style={desktop ? undefined : { flex: 1 }} />
            <Button title={tr('sales:approval.approve')} onPress={() => void run(() => approve(doc.id), tr('sales:approval.approved'))} loading={busy} disabled={busy} style={desktop ? undefined : { flex: 1 }} />
          </View>
        )
      ) : null}
    </Card>
  );
}
