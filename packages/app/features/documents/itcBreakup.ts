import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { itcOfDocument, splitTotal, type ItcBuckets } from '@esmart/core/domain/itc';
import { money } from '@esmart/core/lib/money';
import type { BusinessDocument } from '@esmart/core/types';

/** Purchases that carry credit: not orders, receipts or balances brought in. */
const CREDIT_BEARING = ['purchaseBill', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'];

const BUCKETS: (keyof ItcBuckets)[] = ['eligible', 'capitalGoods', 'reverseCharge', 'blocked', 'ineligible'];

/**
 * A purchase's input tax credit by bucket (core itcOfDocument), in base currency, for the totals
 * panel: what can be claimed, on capital goods, self-assessed under reverse charge, blocked and not
 * claimable. Nothing for a sale, or a purchase that carries no tax.
 */
export function useItcBreakup(
  doc: Pick<BusinessDocument, 'kind' | 'lines' | 'totals' | 'currency' | 'exchangeRate' | 'reverseCharge'> | undefined,
  baseCurrency: string,
): { title: string; rows: { label: string; amount: ReturnType<typeof money>; tone?: 'muted' | 'bad' }[] } | undefined {
  const { t: tr } = useTranslation(['purchases']);
  return useMemo(() => {
    if (!doc || !CREDIT_BEARING.includes(doc.kind)) return undefined;
    const itc = itcOfDocument(doc as BusinessDocument, baseCurrency);
    // A supplier credit note gives credit back: itcOfDocument signs it negative; shown as the note's own amounts.
    const rows = BUCKETS.map((k) => ({ k, minor: Math.abs(splitTotal(itc[k])) }))
      .filter((r) => r.minor > 0)
      .map((r) => ({ label: tr(`purchases:itc.${r.k}`), amount: money(r.minor, baseCurrency), tone: r.k === 'blocked' || r.k === 'ineligible' ? ('bad' as const) : undefined }));
    return rows.length ? { title: tr('purchases:itc.title'), rows } : undefined;
  }, [doc, baseCurrency, tr]);
}
