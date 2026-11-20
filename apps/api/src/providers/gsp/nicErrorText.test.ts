import { describe, expect, it } from 'vitest';
import { failureFrom } from './common';
import { describeGspError, nicErrorsOf } from './envelope';
import { nicErrorText, unknownRefusalText } from './nicErrorText';
import { GspRequestError } from './transport';

describe('portal error wording', () => {
  it('keeps the portal’s own wording when it sent some', () => {
    expect(nicErrorText('2150', 'Duplicate IRN')).toBe('Duplicate IRN');
  });

  it('puts wording to a code the portal repeated as its message', () => {
    expect(nicErrorText('252', '252')).toBe('The CGST tax rate is not valid');
    expect(nicErrorText('222', null)).toBe('The transporter ID is not valid');
    expect(nicErrorText('611', '')).toBe('The document type is not allowed with this supply type');
  });

  it('says something readable for a code it does not know, never the bare code', () => {
    const text = nicErrorText('9999', '9999');
    expect(text).toBe(unknownRefusalText('9999'));
    expect(text).not.toBe('9999');
    expect(nicErrorText(null, '')).toBe(unknownRefusalText(null));
  });

  it('reads NIC’s error array with wording for each bare code', () => {
    const envelope = { success: false, message: JSON.stringify([{ ErrorCode: '252', ErrorMessage: '252' }, { ErrorCode: '2150', ErrorMessage: 'Duplicate IRN' }]) };
    expect(nicErrorsOf(envelope).map((e) => e.text)).toEqual(['The CGST tax rate is not valid', 'Duplicate IRN']);
    // The portal's own wording keeps its code beside it; ours does not repeat one.
    expect(describeGspError(envelope, 'x')).toBe('The CGST tax rate is not valid; Duplicate IRN (2150)');
  });

  it('turns a refusal that is only a code into a message a user can act on', () => {
    const failed = failureFrom(new GspRequestError('253', 'envelope', 200, { success: false, errorCode: '253' }));
    expect(failed.errors[0].message).toBe('The SGST tax rate is not valid');
    expect(failed.errors[0].code).toBe('253');
  });

  it('does not surface a bare number when the gateway sends nothing else', () => {
    const failed = failureFrom(new GspRequestError('4999', 'envelope', 200, null));
    expect(failed.errors[0].message).toMatch(/portal refused the request/);
  });
});
