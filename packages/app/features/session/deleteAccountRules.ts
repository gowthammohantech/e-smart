/**
 * When the delete button may be pressed: online (the server does the deleting), nothing waiting to send
 * (it would be lost with the account), DELETE typed, and a password or a full code entered.
 */
export function canDeleteAccount(s: { online: boolean; unsent: number; typed: string; byPhone: boolean; codeRequested: boolean; code: string; password: string; busy: boolean }): boolean {
  const proof = s.byPhone ? s.codeRequested && /^\d{6}$/.test(s.code.trim()) : s.password.length > 0;
  return s.online && s.unsent === 0 && s.typed.trim() === 'DELETE' && proof && !s.busy;
}
