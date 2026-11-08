import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@esmart/ui/components/EmptyState';

/**
 * What a masters or settings screen shows when its data didn't come back: a way to try again,
 * never an empty list, a zero or a switch that looks off.
 */
export function LoadFailed({ onRetry, compact }: { onRetry: () => unknown; compact?: boolean }) {
  const { t: tr } = useTranslation(['reports']);
  return (
    <EmptyState
      icon="cloud-off-outline"
      title={tr('reports:dash.state.failedTitle')}
      message={tr('reports:dash.state.failedBody')}
      actionLabel={tr('reports:dash.state.retry')}
      onAction={() => void onRetry()}
      compact={compact}
    />
  );
}
