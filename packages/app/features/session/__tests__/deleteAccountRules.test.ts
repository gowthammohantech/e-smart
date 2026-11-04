import { canDeleteAccount } from '../deleteAccountRules';

const ok = { online: true, unsent: 0, typed: 'DELETE', byPhone: false, codeRequested: false, code: '', password: 'pw', busy: false };

describe('canDeleteAccount', () => {
  it('allows it with everything in place', () => {
    expect(canDeleteAccount(ok)).toBe(true);
    expect(canDeleteAccount({ ...ok, typed: '  DELETE ' })).toBe(true);
  });

  it('refuses offline, with unsent changes, or while already deleting', () => {
    expect(canDeleteAccount({ ...ok, online: false })).toBe(false);
    expect(canDeleteAccount({ ...ok, unsent: 1 })).toBe(false);
    expect(canDeleteAccount({ ...ok, busy: true })).toBe(false);
  });

  it('needs DELETE exactly, in capitals', () => {
    expect(canDeleteAccount({ ...ok, typed: 'delete' })).toBe(false);
    expect(canDeleteAccount({ ...ok, typed: 'DELET' })).toBe(false);
  });

  it('needs the password, or a requested six-digit code', () => {
    expect(canDeleteAccount({ ...ok, password: '' })).toBe(false);
    const phone = { ...ok, byPhone: true, password: '' };
    expect(canDeleteAccount({ ...phone, codeRequested: false, code: '123456' })).toBe(false);
    expect(canDeleteAccount({ ...phone, codeRequested: true, code: '12345' })).toBe(false);
    expect(canDeleteAccount({ ...phone, codeRequested: true, code: '123456' })).toBe(true);
  });
});
