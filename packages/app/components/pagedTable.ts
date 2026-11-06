import { useCallback, useState } from 'react';
import { TABLE_PAGE_SIZES } from '@esmart/ui/components/DataTable';
import { useToast } from '@esmart/ui/components/Toast';
import { deliverFile } from '../features/reports/exportFiles';
import { toCsv, type ReportTable } from '../features/reports/reportTable';
import { today } from '@esmart/core/lib/date';

/** What every paged list query in `remote/queries.ts` returns. */
type Pages = {
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};

/**
 * The DataTable props a server list shares: skeleton rows while the first
 * page loads, an error row (`errorMessage`, usually common:table.loadFailed) with Retry, rows per page (remembered as
 * `tableKey`), and the next page fetched when the pager runs past what's
 * loaded. Spread into a `<DataTable>` and add `totalCount` when known.
 */
export function pagedTableProps(pages: Pages, errorMessage: string, tableKey: string) {
  return {
    loading: pages.isLoading,
    error: pages.isError ? errorMessage : null,
    onRetry: () => void pages.refetch(),
    hasMore: pages.hasNextPage,
    onLoadMore: () => {
      if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
    },
    pageSizeOptions: TABLE_PAGE_SIZES,
    tableKey,
  };
}

/** Selected row keys for a table, cleared whenever the list itself changes (a new tab, search or filter). */
export function useTableSelection(resetOn: unknown) {
  const [selected, setSelected] = useState<string[]>([]);
  const [lastReset, setLastReset] = useState(resetOn);
  if (lastReset !== resetOn) {
    setLastReset(resetOn);
    setSelected([]);
  }
  return { selected, setSelected, clear: () => setSelected([]) };
}

/**
 * Hands the chosen rows over as a CSV file named for the list and today's
 * date: a download in a browser, the share sheet on a phone.
 */
export function useRowsExport() {
  const toast = useToast();
  return useCallback(
    async (name: string, table: ReportTable, cancelledMessage: string) => {
      const fileName = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}-${today()}.csv`;
      try {
        await deliverFile(fileName, new TextEncoder().encode(toCsv(table)), 'text/csv');
      } catch {
        toast.show(cancelledMessage, 'info', { icon: 'file-cancel-outline' });
      }
    },
    [toast],
  );
}
