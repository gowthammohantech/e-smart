import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { documentKindLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import type { BusinessDocument } from '@esmart/core/types';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { useAppStore } from '../../../store/appStore';
import { useCurrentUser } from '../../../store/selectors';
import { useApprovalActions } from '../../../features/approvals/ApprovalBanner';
import { detailRouteFor } from '../../../features/documents/DocumentEditor';

/** What waits for an owner or admin: documents over an approval rule's amount, oldest first. */
export default function ApprovalsScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['sales', 'common']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const role = useCurrentUser()?.role ?? '';
  const { approve } = useApprovalActions();
  const pending = useQuery({
    queryKey: ['approvals', companyId],
    enabled: !!companyId,
    queryFn: async () => ((await api.GET('/companies/{companyId}/approvals', { params: { path: { companyId } } })).data?.data ?? []) as unknown as BusinessDocument[],
  });
  const docs = pending.data ?? [];
  const canDecide = role === 'owner' || role === 'admin';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('sales:approval.title') }} />
      {pending.isLoading ? (
        <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
      ) : docs.length ? (
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Card padded={false}>
            {docs.map((d, i) => (
              <ListRow
                key={d.id}
                title={`${documentKindLabel(tr, d.kind, 1)} · ${formatMoney(d.totals.grandTotal)}`}
                subtitle={d.number}
                right={
                  canDecide ? (
                    <Button
                      title={tr('sales:approval.approve')}
                      size="sm"
                      onPress={() =>
                        void approve(d.id)
                          .then(() => toast.show(tr('sales:approval.approved'), 'success', { icon: 'check', detail: d.number }))
                          .catch((err) => toast.show(describeError(err, tr), 'error'))
                      }
                    />
                  ) : undefined
                }
                chevron
                divider={i < docs.length - 1}
                onPress={() => router.push(detailRouteFor(d.kind, d.id) as never)}
              />
            ))}
          </Card>
        </ScrollView>
      ) : (
        <EmptyState icon="check-decagram-outline" title={tr('sales:approval.empty')} message={tr('sales:approval.emptyBody')} />
      )}
    </View>
  );
}
