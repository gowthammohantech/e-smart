import { sanitizeAmountInput, toAmountInput } from '@/lib/format';
import { hsnMandatory, sanitizePrefix, validHsn } from '@/lib/validators';
import { accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@/domain/paymentAccounts';
import { formatNumber } from '@/domain/numbering';
import { fromMajor, zero } from '@/lib/money';
import { NumberingSeries, PaymentAccount } from '@/types';

describe('amount input', () => {
  it('strips a minus sign unless negatives are allowed', () => {
    expect(sanitizeAmountInput('-12.345', 'INR')).toBe('12.34');
    expect(sanitizeAmountInput('-12.345', 'INR', { allowNegative: true })).toBe('-12.34');
    expect(sanitizeAmountInput('-', 'INR', { allowNegative: true })).toBe('-');
    expect(sanitizeAmountInput('1-2', 'INR', { allowNegative: true })).toBe('12');
  });

  it('renders money as a fixed-precision input string', () => {
    expect(toAmountInput(fromMajor('1234.5', 'INR'))).toBe('1234.50');
    expect(toAmountInput(fromMajor('-0.4', 'INR'))).toBe('-0.40');
  });
});

describe('document number prefix', () => {
  it('accepts a slash but not a leading separator or doubled slashes', () => {
    expect(sanitizePrefix('inv/a')).toBe('INV/A');
    expect(sanitizePrefix('/inv')).toBe('INV');
    expect(sanitizePrefix('INV//A')).toBe('INV/A');
    expect(sanitizePrefix('IN V#1')).toBe('INV1');
  });

  it('does not double the separator after a trailing slash', () => {
    const series: NumberingSeries = {
      id: 's', companyId: 'c', kind: 'invoice', prefix: 'INV/', nextNumber: 7, padding: 4,
      includeFiscalYear: false, includeBranchCode: false, resetPolicy: 'never',
    };
    expect(formatNumber(series, { date: '2026-09-22' })).toBe('INV/0007');
  });
});

describe('HSN/SAC', () => {
  it('is mandatory only for a GST-registered business', () => {
    expect(hsnMandatory({ regime: 'GST', registered: true })).toBe(true);
    expect(hsnMandatory({ regime: 'GST', registered: false })).toBe(false);
    expect(hsnMandatory(undefined)).toBe(false);
    expect(validHsn('', { required: true })).toBeDefined();
    expect(validHsn('', { required: false })).toBeUndefined();
  });

  it('takes 4, 6 or 8 digits', () => {
    ['8482', '848210', '84821011'].forEach((v) => expect(validHsn(v, { required: true })).toBeUndefined());
    ['848', '84821', '8482101', '848210111'].forEach((v) => expect(validHsn(v, { required: false })).toBeDefined());
  });
});

describe('payment method and account', () => {
  const acc = (id: string, type: PaymentAccount['type'], isDefault = false): PaymentAccount => ({
    id, companyId: 'c', name: id, type, currency: 'INR', openingBalance: zero('INR'), isDefault,
  });
  const accounts = [acc('cash', 'cash', true), acc('hdfc', 'bank'), acc('paytm', 'wallet')];

  it('never offers cash in hand for a bank payment', () => {
    expect(accountsForMethod('bank', accounts).map((a) => a.id)).toEqual(['hdfc']);
    expect(defaultAccountFor('bank', accounts)?.id).toBe('hdfc');
    expect(defaultAccountFor('cash', accounts)?.id).toBe('cash');
    expect(accountsForMethod('upi', accounts).map((a) => a.id)).toEqual(['hdfc', 'paytm']);
  });

  it('moves off an account that no longer fits the method', () => {
    expect(accountIdAfterMethodChange('bank', 'cash', accounts)).toBe('hdfc');
    expect(accountIdAfterMethodChange('upi', 'hdfc', accounts)).toBe('hdfc');
    expect(accountIdAfterMethodChange('bank', 'cash', [acc('cash', 'cash', true)])).toBe('');
  });
});
