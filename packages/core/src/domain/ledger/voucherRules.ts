/**
 * What a voucher may post to, shared by the API (which enforces it) and the app (which offers only
 * what will save).
 */

/**
 * System accounts only the books themselves post to: opening stock comes from the stock ledger,
 * accumulated depreciation from the asset register, goods received not billed from goods receipts.
 * A journal into one would quietly undo what its source works out (RULES 6.10, 6.15).
 */
export const VOUCHER_BLOCKED_KEYS = ['sys:openingStock', 'sys:accumulatedDepreciation', 'sys:goodsReceivedNotBilled'];

/** Earlier years' profit: open to vouchers, but only posted by these roles and with a narration. */
export const RETAINED_EARNINGS = 'sys:retainedEarnings';
export const RETAINED_EARNINGS_ROLES: string[] = ['owner', 'admin'];

/** Accounts the books keep from their own sources: tax, sales and the opening difference. */
export const CONTROL_KEY = /^sys:(output|input|rcmPayable|gstCashLedger|gstOnAdvances|tdsPayable|tdsReceivable|tcsPayable|customsPayable|sales|openingDifference)/;

/** The GST portal's cash ledger: money goes in by a GST challan and out by a set-off, nothing else. */
export const GST_CASH_LEDGER_PREFIX = 'sys:gstCashLedger:';

/** Who may record a voucher at all (the API's `createVoucher` roles). */
export const VOUCHER_ROLES: string[] = ['owner', 'admin', 'accountant'];

/**
 * Whether a receipt voucher (money into cash or bank, from `key`) saves for someone in `role`:
 * `refused` never does; `narration` does only with the reason written down (an owner or admin
 * adjusting a control account, earlier years' profit, or a contact's ledger); `ok` saves as it is.
 */
export function receiptSourceRule(key: string, role: string | undefined): 'ok' | 'narration' | 'refused' {
  if (!VOUCHER_ROLES.includes(role ?? '')) return 'refused';
  if (VOUCHER_BLOCKED_KEYS.includes(key) || key.startsWith(GST_CASH_LEDGER_PREFIX)) return 'refused';
  // Money into cash or bank from a contact's ledger skips their invoices: an owner's call, as a control account is.
  if (key === RETAINED_EARNINGS || CONTROL_KEY.test(key) || key.startsWith('party:')) return RETAINED_EARNINGS_ROLES.includes(role ?? '') ? 'narration' : 'refused';
  return 'ok';
}
