import { joinPhone, maxNationalDigits, sanitizeDialCode, sanitizePhoneNumber, splitPhone, validPhoneParts } from '../phone';

describe('phone input', () => {
  it('keeps the country code to a plus and up to four digits', () => {
    expect(sanitizeDialCode('91')).toBe('+91');
    expect(sanitizeDialCode('+9a1')).toBe('+91');
    expect(sanitizeDialCode('+12345')).toBe('+1234');
    expect(sanitizeDialCode('')).toBe('+');
  });

  it('takes digits only, no more than the country allows', () => {
    expect(sanitizePhoneNumber('98765 abc 43210', '+91')).toBe('9876543210');
    expect(sanitizePhoneNumber('987654321099', '+91')).toBe('9876543210');
    expect(maxNationalDigits('+44')).toBe(14);
  });

  it('wants ten digits after +91 and a real code otherwise', () => {
    expect(validPhoneParts('+91', '')).toBeUndefined();
    expect(validPhoneParts('+91', '9876543210')).toBeUndefined();
    expect(validPhoneParts('+91', '98765')).toBeDefined();
    expect(validPhoneParts('+', '9876543210')).toBeDefined();
    expect(validPhoneParts('+44', '2071234567')).toBeUndefined();
  });

  it('joins the code and number, or nothing without a number', () => {
    expect(joinPhone('+91', '9876543210')).toBe('+91 9876543210');
    expect(joinPhone('+91', '')).toBe('');
  });
});

describe('saved phone', () => {
  it('splits back into code and number', () => {
    expect(splitPhone('+91 98200 41120')).toEqual({ code: '+91', number: '9820041120' });
    expect(splitPhone('+91 22 2771 4410')).toEqual({ code: '+91', number: '2227714410' });
    expect(splitPhone('+971 50 442 8890')).toEqual({ code: '+971', number: '504428890' });
    expect(splitPhone('9876543210')).toEqual({ code: '+91', number: '9876543210' });
    expect(splitPhone(undefined)).toEqual({ code: '+91', number: '' });
  });
});
