import { amountInWords, numberInWords } from '../amountInWords';

const inr = (minor: number) => ({ minor, currency: 'INR' as const });

describe('amount in words', () => {
  it('reads small rupee amounts', () => {
    expect(amountInWords(inr(0))).toBe('Rupees Zero Only');
    expect(amountInWords(inr(100))).toBe('Rupees One Only');
    expect(amountInWords(inr(9950))).toBe('Rupees Ninety Nine and Fifty Paise Only');
    expect(amountInWords(inr(50))).toBe('Fifty Paise Only');
  });

  it('counts rupees in lakhs and crores', () => {
    expect(amountInWords(inr(1_00_000_00))).toBe('Rupees One Lakh Only');
    expect(amountInWords(inr(12_34_56_789_05))).toBe(
      'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Five Paise Only',
    );
    expect(numberInWords(1_00_00_00_000)).toBe('One Hundred Crore');
    expect(numberInWords(10_00_00_00_00_000)).toBe('One Lakh Crore');
  });

  it('skips empty places', () => {
    expect(numberInWords(1_00_001)).toBe('One Lakh One');
    expect(numberInWords(2_00_15_000)).toBe('Two Crore Fifteen Thousand');
    expect(numberInWords(110)).toBe('One Hundred Ten');
  });

  it('counts other currencies in thousands and millions', () => {
    expect(amountInWords({ minor: 1_234_567_89, currency: 'USD' })).toBe(
      'US Dollars One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Cents Only',
    );
    expect(amountInWords({ minor: 1500, currency: 'JPY' })).toBe('Japanese Yen One Thousand Five Hundred Only');
  });

  it('marks a negative amount', () => {
    expect(amountInWords(inr(-2500))).toBe('Minus Rupees Twenty Five Only');
  });
});
