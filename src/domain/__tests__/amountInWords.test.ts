import { amountInWords } from '@/lib/format';
import { fromMajor } from '@/lib/money';

const words = (major: string) => amountInWords(fromMajor(major, 'INR'));

describe('amount in words', () => {
  it('counts on the Indian scale', () => {
    expect(words('120000')).toBe('One lakh twenty thousand rupees only');
    expect(words('10000000')).toBe('One crore rupees only');
    expect(words('12345678')).toBe(
      'One crore twenty-three lakh forty-five thousand six hundred and seventy-eight rupees only',
    );
  });

  it('reads hundreds and tens the way a cheque does', () => {
    expect(words('101')).toBe('One hundred and one rupees only');
    expect(words('999')).toBe('Nine hundred and ninety-nine rupees only');
    expect(words('15')).toBe('Fifteen rupees only');
  });

  it('includes paise when there are any', () => {
    expect(words('1250.50')).toBe('One thousand two hundred and fifty rupees and fifty paise only');
    expect(words('0.05')).toBe('Zero rupees and five paise only');
  });

  it('handles zero', () => {
    expect(words('0')).toBe('Zero rupees only');
  });
});
