import { financialYearLabel, generateIrn, irnSource, isWellFormedIrn } from '@/domain/gst/einvoice/irn';

const GSTIN = '27AAPFU0939F1ZV';

describe('financial year', () => {
  it('starts in April', () => {
    expect(financialYearLabel('2026-03-31')).toBe('2025-26');
    expect(financialYearLabel('2026-04-01')).toBe('2026-27');
    expect(financialYearLabel('2026-12-31')).toBe('2026-27');
    expect(financialYearLabel('2027-01-01')).toBe('2026-27');
  });

  it('pads the second year across a century', () => {
    expect(financialYearLabel('2099-04-01')).toBe('2099-00');
  });
});

describe('IRN', () => {
  const base = { supplierGstin: GSTIN, docType: 'INV' as const, docNo: 'INV/2026-27/0001', date: '2026-09-18' };

  it('is 64 lowercase hex characters', () => {
    const irn = generateIrn(base);
    expect(irn).toMatch(/^[0-9a-f]{64}$/);
    expect(isWellFormedIrn(irn)).toBe(true);
  });

  it('is stable for the same document', () => {
    expect(generateIrn(base)).toBe(generateIrn({ ...base }));
  });

  it('changes when any identifying fact changes', () => {
    const irn = generateIrn(base);
    expect(generateIrn({ ...base, docNo: 'INV/2026-27/0002' })).not.toBe(irn);
    expect(generateIrn({ ...base, docType: 'CRN' })).not.toBe(irn);
    expect(generateIrn({ ...base, supplierGstin: '29AAPFU0939F1ZM' })).not.toBe(irn);
    // Same document number in a different financial year is a different IRN.
    expect(generateIrn({ ...base, date: '2025-09-18' })).not.toBe(irn);
  });

  it('hashes the four identifying facts joined by hyphens', () => {
    expect(irnSource(GSTIN, 'INV', 'INV/0001', '2026-27')).toBe(
      '27AAPFU0939F1ZV-INV-INV/0001-2026-27',
    );
  });

  it('rejects anything that is not a hash', () => {
    expect(isWellFormedIrn('nope')).toBe(false);
    expect(isWellFormedIrn(undefined)).toBe(false);
    expect(isWellFormedIrn('A'.repeat(64))).toBe(false);
  });
});
