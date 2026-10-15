import { renderEmailHtml } from './emailLayout';

/** The password reset email. Provider-neutral: it only builds the message. */

export const resetLink = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

export function buildResetEmail(i: { appUrl: string; token: string; name: string; expiresInMinutes: number }): { subject: string; text: string; html: string } {
  const link = resetLink(i.appUrl, i.token);
  const when = i.expiresInMinutes % 60 === 0 ? `${i.expiresInMinutes / 60} hour${i.expiresInMinutes === 60 ? '' : 's'}` : `${i.expiresInMinutes} minutes`;
  const footer = `This link works once and expires in ${when}. If you didn't ask for this, you can ignore this email; your password stays the same.`;
  const text = [`Hi ${i.name},`, '', 'We got a request to reset your Elixir Books password. Choose a new one here:', link, '', footer].join('\n');
  const html = renderEmailHtml({
    heading: 'Reset your password',
    paragraphs: [`Hi ${i.name},`, 'We got a request to reset your Elixir Books password. Choose a new one with the button below.'],
    buttonLabel: 'Reset password',
    link,
    footer,
  });
  return { subject: 'Reset your Elixir Books password', text, html };
}
