import { isIndividualPan, tdsFor, tdsQuarter, tdsRegister } from '../tds';

const L = 1_00_000_00; // ₹1 lakh in paise
const none = { baseMinor: 0, tdsMinor: 0 };
const run = (over: Partial<Parameters<typeof tdsFor>[0]>) =>
  tdsFor({ section: '194C', pan: 'AABCK1234F', date: '2026-06-01', baseMinor: 0, prior: none, ...over });

describe('TDS', () => {
  it('deducts nothing below both thresholds', () => {
    expect(run({ baseMinor: 25_000_00 })).toMatchObject({ amountMinor: 0, reason: 'belowThreshold' });
  });

  it('deducts on one bill over the single threshold, at the company rate', () => {
    expect(run({ baseMinor: 40_000_00 })).toMatchObject({ rate: 2, amountMinor: 80_000, reason: 'deducted' });
  });

  it('uses the individual rate for an individual or HUF PAN', () => {
    expect(isIndividualPan('ABCPK1234F')).toBe(true);
    expect(run({ baseMinor: 40_000_00, pan: 'ABCPK1234F' })).toMatchObject({ rate: 1, amountMinor: 40_000 });
  });

  it('catches up on the year when a bill takes the total past the annual threshold', () => {
    // Three earlier bills of ₹25,000 had no TDS; a fourth makes ₹1,05,000.
    const r = run({ baseMinor: 30_000_00, prior: { baseMinor: 75_000_00, tdsMinor: 0 } });
    expect(r).toMatchObject({ amountMinor: 2_10_000, reason: 'catchUp' });
    // After that, each bill is taxed in full.
    expect(run({ baseMinor: 10_000_00, prior: { baseMinor: 1_05_000_00, tdsMinor: 2_10_000 } }).amountMinor).toBe(20_000);
  });

  it('deducts 20% from a deductee with no PAN (s.206AA)', () => {
    expect(run({ baseMinor: 40_000_00, pan: undefined })).toMatchObject({ rate: 20, reason: 'noPan', amountMinor: 8_00_000 });
  });

  it('holds a certificate to its section, its start and its limit', () => {
    const base = { rate: 0.5, validTill: '2026-12-31' };
    expect(run({ baseMinor: 40_000_00, certificate: { ...base, section: '194JB' } })).toMatchObject({ reason: 'deducted' });
    expect(run({ baseMinor: 40_000_00, certificate: { ...base, validFrom: '2026-12-01' } })).toMatchObject({ reason: 'deducted' });
    expect(run({ baseMinor: 40_000_00, certificate: { ...base, limitMinor: 30_000_00 } })).toMatchObject({ reason: 'deducted' });
    expect(run({ baseMinor: 40_000_00, certificate: { ...base, limitMinor: 50_000_00 } })).toMatchObject({ rate: 0.5, reason: 'lowerCertificate' });
  });

  it('applies a lower deduction certificate while it is valid', () => {
    const certificate = { rate: 0.5, validTill: '2026-12-31' };
    expect(run({ baseMinor: 40_000_00, certificate })).toMatchObject({ rate: 0.5, reason: 'lowerCertificate' });
    expect(run({ baseMinor: 40_000_00, certificate, date: '2027-01-02' })).toMatchObject({ rate: 2 });
  });

  it('taxes only what the year’s purchases exceed ₹50 lakh by under 194Q', () => {
    const q = (baseMinor: number, priorBase: number) => tdsFor({ section: '194Q', pan: 'AABCK1234F', date: '2026-06-01', baseMinor, prior: { baseMinor: priorBase, tdsMinor: 0 } });
    expect(q(10 * L, 30 * L).amountMinor).toBe(0);
    expect(q(30 * L, 40 * L).amountMinor).toBe(Math.round(20 * L * 0.001));
    expect(q(5 * L, 60 * L).amountMinor).toBe(Math.round(5 * L * 0.001));
  });

  it('places a date in its 26Q quarter', () => {
    expect(tdsQuarter('2026-04-01')).toEqual({ fy: '2026-27', quarter: 1 });
    expect(tdsQuarter('2026-12-31')).toEqual({ fy: '2026-27', quarter: 3 });
    expect(tdsQuarter('2027-03-31')).toEqual({ fy: '2026-27', quarter: 4 });
  });

  it('registers deductions by section, deductee and quarter, net of credit notes', () => {
    const tds = (minor: number) => ({ section: '194C', amount: { minor } });
    const rows = tdsRegister(
      [
        { partyId: 'p', date: '2026-05-01', tds: tds(800), baseMinor: 40_000, sign: 1 },
        { partyId: 'p', date: '2026-06-01', tds: tds(200), baseMinor: 10_000, sign: -1 },
        { partyId: 'p', date: '2026-08-01', tds: tds(400), baseMinor: 20_000, sign: 1 },
      ],
      [{ id: 'p', name: 'Shree Transport', pan: 'AABCS1234K' }],
      { from: '2026-04-01', to: '2027-03-31' },
    );
    expect(rows.map((r) => [r.quarter, r.tdsMinor, r.baseMinor])).toEqual([
      ['FY 2026-27 Q1', 600, 30_000],
      ['FY 2026-27 Q2', 400, 20_000],
    ]);
  });
});
