/**
 * When the archive button may be pressed: online (the server does it), nothing of this business
 * waiting to send (it would be refused once archived), its name typed, and a password or a full code.
 */
export function canArchiveCompany(s: {
  online: boolean;
  unsent: number;
  name: string;
  typed: string;
  byPhone: boolean;
  codeRequested: boolean;
  code: string;
  password: string;
  busy: boolean;
}): boolean {
  const proof = s.byPhone ? s.codeRequested && /^\d{6}$/.test(s.code.trim()) : s.password.length > 0;
  const named = s.typed.trim().toLocaleLowerCase('en-IN') === s.name.trim().toLocaleLowerCase('en-IN');
  return s.online && s.unsent === 0 && named && proof && !s.busy;
}
