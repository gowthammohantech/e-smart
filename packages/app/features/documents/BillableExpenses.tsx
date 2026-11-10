import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { claimableTax } from '@esmart/core/domain/expenseTax';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { uid } from '@esmart/core/lib/id';
import type { DocumentLine, Expense } from '@esmart/core/types';
import { useExpenseCategories, useHasModule, useTaxCategories } from '../../store/selectors';
import { useBillableExpenses } from '../../remote/queries';

/**
 * The customer's billable expenses not yet recovered, to add to an invoice as reimbursement lines at
 * cost (Rule 33: outside the taxable value, no GST). An expense whose credit was claimed is flagged:
 * a pure agent's recovery is of a cost incurred in the customer's name, without credit.
 */
export function BillableExpenses({ partyId, currency, documentId, lines, onAdd }: { partyId?: string; currency: string; documentId?: string; lines: DocumentLine[]; onAdd: (line: DocumentLine) => void }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['sales']);
  // The server knows which are already on a live invoice; lines added here count too.
  const billable = useBillableExpenses(useHasModule('expenses') ? partyId : undefined, currency, documentId).data;
  const categories = useExpenseCategories();
  const taxCategories = useTaxCategories();

  const open = useMemo(() => {
    const added = new Set(lines.map((l) => l.expenseId).filter(Boolean));
    return (billable ?? []).filter((e) => !added.has(e.id));
  }, [billable, lines]);

  if (!open.length) return null;
  const nil = taxCategories.find((c) => c.rate === 0) ?? taxCategories[0];
  const add = (e: Expense) => {
    const category = categories.find((c) => c.id === e.categoryId)?.name ?? tr('sales:reimburse.expense');
    onAdd({
      id: uid('ln'),
      name: e.notes ? `${category}: ${e.notes}`.slice(0, 200) : category,
      quantity: 1,
      unit: 'NOS',
      unitPrice: e.amount,
      discountMode: 'percent',
      discountValue: 0,
      taxCategoryId: nil?.id ?? '',
      taxRate: 0,
      taxInclusive: false,
      gst: { reimbursement: true },
      expenseId: e.id,
    });
  };

  return (
    <Card style={{ gap: t.spacing.sm }}>
      <Text variant="body" weight="600">
        {tr('sales:reimburse.title', { count: open.length })}
      </Text>
      <Text variant="caption" tone="muted">
        {tr('sales:reimburse.body')}
      </Text>
      {open.map((e) => (
        // A list row across the card: the expense on the left, Add at the right edge.
        <View key={e.id} style={{ gap: t.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md }}>
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {`${e.number} · ${formatDate(e.date)} · ${formatMoney(e.amount)}`}
            </Text>
            <Button title={tr('sales:reimburse.add')} size="sm" variant="secondary" icon="plus" onPress={() => add(e)} />
          </View>
          {claimableTax(e).minor > 0 ? (
            <Text variant="caption" tone="warn">
              {tr('sales:reimburse.creditClaimed', { tax: formatMoney(claimableTax(e)) })}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
