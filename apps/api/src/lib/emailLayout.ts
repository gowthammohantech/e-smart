/**
 * The one HTML shell every transactional email shares: brand line, heading,
 * paragraphs, a button, the raw link, and a footer note. Change the look of
 * all emails here; the wording lives next to each email (inviteEmail.ts,
 * resetEmail.ts).
 */
import { LOGO_CID } from './emailLogo';

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export type EmailLayout = {
  heading: string;
  /** Plain text paragraphs; `**bold**` marks emphasis. Escaped before use. */
  paragraphs: string[];
  buttonLabel: string;
  link: string;
  footer: string;
};

const withBold = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export function renderEmailHtml(e: EmailLayout): string {
  const link = escapeHtml(e.link);
  // Inline styles and a table layout: email clients ignore most of the rest.
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1f23;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="padding-right:10px;vertical-align:middle;"><img src="cid:${LOGO_CID}" alt="Elixir Books" width="31" height="45" style="display:block;border:0;outline:none;width:31px;height:45px;"></td>
                    <td style="vertical-align:middle;font-size:16px;font-weight:700;letter-spacing:0.3px;color:#2e3590;">Elixir Books</td>
                  </tr>
                </table>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(e.heading)}</h1>
                ${e.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${withBold(p)}</p>`).join('\n                ')}
                <p style="margin:8px 0 24px;">
                  <a href="${link}" style="display:inline-block;background:#007aff;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">${escapeHtml(e.buttonLabel)}</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5b6470;">Or paste this link into your browser:</p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:#007aff;">${link}</a></p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#8a919b;">${escapeHtml(e.footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
