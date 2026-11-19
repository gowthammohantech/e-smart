import { receiptSourceRule } from '../ledger/voucherRules';

describe('receiptSourceRule: what a receipt voucher can be received for', () => {
  it('takes an income or an ordinary account from anyone who records vouchers', () => {
    for (const role of ['owner', 'admin', 'accountant']) {
      expect(receiptSourceRule('sys:otherIncome', role)).toBe('ok');
      expect(receiptSourceRule('sys:capital', role)).toBe('ok');
      expect(receiptSourceRule('acc:la_1', role)).toBe('ok');
      expect(receiptSourceRule('exp:cat_1', role)).toBe('ok');
    }
  });

  it('never takes what the books keep themselves, or the GST cash ledger', () => {
    for (const key of ['sys:openingStock', 'sys:accumulatedDepreciation', 'sys:goodsReceivedNotBilled', 'sys:gstCashLedger:igst']) {
      expect(receiptSourceRule(key, 'owner')).toBe('refused');
    }
  });

  it('leaves control accounts, earlier years’ profit and a contact’s ledger to an owner or admin, with a reason', () => {
    for (const key of ['sys:outputIgst', 'sys:tdsPayable', 'sys:tdsReceivable', 'sys:sales', 'sys:openingDifference', 'sys:retainedEarnings', 'party:p_1']) {
      expect(receiptSourceRule(key, 'owner')).toBe('narration');
      expect(receiptSourceRule(key, 'admin')).toBe('narration');
      expect(receiptSourceRule(key, 'accountant')).toBe('refused');
    }
  });

  it('takes nothing from someone who cannot record vouchers', () => {
    expect(receiptSourceRule('sys:otherIncome', 'sales')).toBe('refused');
    expect(receiptSourceRule('sys:otherIncome', 'viewer')).toBe('refused');
    expect(receiptSourceRule('sys:otherIncome', undefined)).toBe('refused');
  });
});
