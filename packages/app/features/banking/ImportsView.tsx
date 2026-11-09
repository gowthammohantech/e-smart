import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { formatDate } from '@esmart/core/lib/date';
import { removeBankStatement, useBankStatements } from '../../remote/banking';
import { useCanWrite } from '../../remote/connectivity';
import { useBankAction } from './parts';
import { ListSkeleton } from '../../components/ScreenSkeleton';

/**
 * The statements imported into an account, newest first: when, from which file, the dates they cover
 * and how many of their lines are explained. An import made by mistake (the wrong account, the wrong
 * file) can be undone: its lines go, and whatever they were matched to stays in the books.
 */
export function ImportsView({ accountId }: { accountId: string }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['banking', 'reports']);
  const statements = useBankStatements(accountId);
  const canWrite = useCanWrite();
  const { run, busy } = useBankAction();
  const [undo, setUndo] = useState<{ id: string; fileName: string; lineCount: number } | null>(null);
  if (statements.isPending) return <ListSkeleton kind="list" rows={4} />;
  // A failed fetch isn't "no statements imported yet".
  if (statements.isError && !statements.data)
    return <EmptyState icon="cloud-off-outline" title={tr('reports:dash.state.failedTitle')} message={tr('reports:dash.state.failedBody')} actionLabel={tr('reports:dash.state.retry')} onAction={() => void statements.refetch()} />;
  const rows = statements.data ?? [];
  if (!rows.length) return <EmptyState icon="file-upload-outline" title={tr('banking:imports.empty')} message={tr('banking:imports.emptyBody')} />;
  return (
    // The screen pads a desktop's tab already; the list keeps a readable width there, Undo near the file it undoes.
    <ScrollView contentContainerStyle={{ padding: desktop ? 0 : t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
      <Card padded={false} style={desktop ? { maxWidth: 880 } : undefined}>
        {rows.map((s, i) => (
          <ListRow
            key={s.id}
            title={s.fileName}
            subtitle={[
              s.from && s.to ? tr('banking:imports.covers', { from: formatDate(s.from), to: formatDate(s.to) }) : undefined,
              tr('banking:imports.counts', { lines: s.lineCount, unmatched: s.unmatched, matched: s.matched, excluded: s.excluded }),
              tr('banking:imports.on', { date: formatDate(s.createdAt.slice(0, 10)) }),
            ]
              .filter(Boolean)
              .join(' · ')}
            icon="file-table-outline"
            right={canWrite ? <Button size="sm" variant="ghost" icon="undo-variant" title={tr('banking:imports.undo')} onPress={() => setUndo({ id: s.id!, fileName: s.fileName, lineCount: s.lineCount })} loading={busy === `undo:${s.id}`} /> : undefined}
            divider={i < rows.length - 1}
          />
        ))}
      </Card>
      <ConfirmDialog
        visible={!!undo}
        destructive
        title={tr('banking:imports.undoTitle', { name: undo?.fileName ?? '' })}
        message={tr('banking:imports.undoBody', { count: undo?.lineCount ?? 0 })}
        confirmLabel={tr('banking:imports.undo')}
        onCancel={() => setUndo(null)}
        onConfirm={() => {
          const u = undo!;
          setUndo(null);
          void run(`undo:${u.id}`, () => removeBankStatement(accountId, u.id), tr('banking:imports.undone'));
        }}
      />
    </ScrollView>
  );
}
