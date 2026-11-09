import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import {
  Skeleton,
  SkeletonCard,
  SkeletonFormField,
  SkeletonGroup,
  SkeletonRows,
  SkeletonStatGrid,
  SkeletonTable,
  SkeletonText,
  SkeletonTotals,
} from '@esmart/ui/components/Skeleton';

/*
 * Placeholders shaped like the screens they stand in for, so nothing jumps when the
 * data lands. Each is one loading region with one shared shimmer.
 */

/** A list: an optional strip of tiles and chips, then rows. For phones; desktop tables draw their own. */
export function ListSkeleton({
  rows = 8,
  kind = 'document',
  tiles = 0,
  chips = false,
  card = true,
  label,
}: {
  rows?: number;
  kind?: 'document' | 'list';
  tiles?: number;
  chips?: boolean;
  /** Rows sit on a card, as the real lists do. */
  card?: boolean;
  label?: string;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const body = <SkeletonRows rows={rows} kind={kind} />;
  return (
    <SkeletonGroup label={label} style={{ gap: t.spacing.md }}>
      {tiles ? <SkeletonStatGrid tiles={tiles} across={desktop} /> : null}
      {chips ? <ChipRow /> : null}
      {card ? <View style={{ borderRadius: t.radius.lg, backgroundColor: t.c.card, overflow: 'hidden' }}>{body}</View> : body}
    </SkeletonGroup>
  );
}

/** Rows to add under a list while the next page is on its way. Stretches across a centred footer. */
export function MoreRowsSkeleton({ rows = 3, kind = 'document' }: { rows?: number; kind?: 'document' | 'list' }) {
  const t = useTheme();
  return (
    <SkeletonGroup style={{ alignSelf: 'stretch', borderRadius: t.radius.lg, backgroundColor: t.c.card, overflow: 'hidden' }}>
      <SkeletonRows rows={rows} kind={kind} />
    </SkeletonGroup>
  );
}

/** Rows for a list that already sits on a card. */
export function CardRowsSkeleton({ rows = 8, kind = 'document' }: { rows?: number; kind?: 'document' | 'list' }) {
  return (
    <SkeletonGroup>
      <SkeletonRows rows={rows} kind={kind} />
    </SkeletonGroup>
  );
}

/** A wide table on a card, for desktop screens that draw their own. */
export function TableSkeleton({ rows = 8, cols = 5, label }: { rows?: number; cols?: number; label?: string }) {
  return (
    <SkeletonGroup label={label}>
      <SkeletonCard title={false} style={{ padding: 0 }}>
        <SkeletonTable rows={rows} cols={cols} />
      </SkeletonCard>
    </SkeletonGroup>
  );
}

function ChipRow() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      {[64, 80, 72, 56].map((w, i) => (
        <Skeleton key={i} height={30} width={w} radius={15} />
      ))}
    </View>
  );
}

/** A record: header with party, number, status and amount; a grid of details; lines; totals. */
export function DetailSkeleton({ lines = 3, tiles = 0, label }: { lines?: number; tiles?: number; label?: string }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  return (
    <SkeletonGroup label={label} style={{ gap: t.spacing.lg }}>
      <SkeletonCard title={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Skeleton height={44} width={44} radius={22} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={16} width="55%" radius={4} />
            <Skeleton height={11} width="35%" radius={4} />
          </View>
          <Skeleton height={20} width={64} radius={10} />
        </View>
        <Skeleton height={30} width="45%" radius={6} style={{ marginTop: t.spacing.sm }} />
      </SkeletonCard>
      {tiles ? <SkeletonStatGrid tiles={tiles} across={desktop} /> : null}
      <SkeletonCard>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.md }}>
          {Array.from({ length: 4 }, (_, i) => (
            <View key={i} style={{ width: '50%', gap: 6, paddingRight: t.spacing.md }}>
              <Skeleton height={10} width="40%" radius={4} />
              <Skeleton height={13} width="70%" radius={4} />
            </View>
          ))}
        </View>
      </SkeletonCard>
      {lines ? (
        <SkeletonCard>
          <SkeletonRows rows={lines} icon={false} />
          <View style={{ paddingTop: t.spacing.md, borderTopWidth: 0.5, borderTopColor: t.c.line }}>
            <SkeletonTotals />
          </View>
        </SkeletonCard>
      ) : null}
    </SkeletonGroup>
  );
}

/** A form: sections of fields, an optional block of line items, the action bar. */
export function FormSkeleton({ fields = 5, items = false, label }: { fields?: number; items?: boolean; label?: string }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const fieldList = Array.from({ length: fields }, (_, i) => (
    <View key={i} style={desktop ? { width: '50%', paddingRight: t.spacing.md } : null}>
      <SkeletonFormField index={i} />
    </View>
  ));
  return (
    <SkeletonGroup label={label} style={{ gap: t.spacing.lg }}>
      <SkeletonCard>
        <View style={desktop ? { flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.lg } : { gap: t.spacing.lg }}>{fieldList}</View>
      </SkeletonCard>
      {items ? (
        <SkeletonCard>
          <SkeletonRows rows={2} icon={false} />
          <Skeleton height={40} radius={t.radius.md} />
          <View style={{ paddingTop: t.spacing.md }}>
            <SkeletonTotals />
          </View>
        </SkeletonCard>
      ) : null}
      {/* A desktop's buttons are 36px tall and sized to their labels. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.md }}>
        <Skeleton height={desktop ? 36 : 44} width={desktop ? 88 : 110} radius={t.radius.md} />
        <Skeleton height={desktop ? 36 : 44} width={desktop ? 112 : 140} radius={t.radius.md} />
      </View>
    </SkeletonGroup>
  );
}

/** A report's body: a figures card (or tiles) and a table section. Sits inside the report shell. */
export function ReportSkeleton({ tiles = 0, figures = 3, rows = 8, cols = 4, label }: { tiles?: number; figures?: number; rows?: number; cols?: number; label?: string }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  return (
    <SkeletonGroup label={label} style={{ gap: t.spacing.lg }}>
      {tiles ? <SkeletonStatGrid tiles={tiles} across={desktop} /> : null}
      {figures ? (
        <SkeletonCard title={false}>
          <SkeletonTotals rows={figures} />
        </SkeletonCard>
      ) : null}
      <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
        <Skeleton height={10} width={120} radius={4} />
        <SkeletonCard title={false} style={{ padding: 0 }}>
          <SkeletonTable rows={rows} cols={cols} />
        </SkeletonCard>
      </View>
    </SkeletonGroup>
  );
}

/** A report screen before its shell can draw: a scope bar over the report body. */
export function ReportPageSkeleton(props: React.ComponentProps<typeof ReportSkeleton>) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm, paddingTop: t.spacing.md }}>
        <Skeleton height={34} width={130} radius={17} />
        <Skeleton height={34} width={90} radius={17} />
      </View>
      <ReportSkeleton {...props} />
    </View>
  );
}

/** A printed page: the document preview's sheet. */
export function PageSkeleton({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <SkeletonGroup label={label}>
      <SkeletonCard title={false} style={{ gap: t.spacing.xl, padding: t.spacing.xl }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ gap: 8, width: '45%' }}>
            <Skeleton height={18} width="80%" radius={4} />
            <SkeletonText lines={3} height={10} />
          </View>
          <Skeleton height={48} width={48} radius={8} />
        </View>
        <SkeletonTable rows={5} cols={4} />
        <View style={{ alignSelf: 'flex-end', width: '50%' }}>
          <SkeletonTotals />
        </View>
      </SkeletonCard>
    </SkeletonGroup>
  );
}
