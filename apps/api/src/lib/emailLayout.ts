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

export type DocumentEmail = {
  businessName: string;
  /** The `cid` of the business logo carried inside the email; without one only the name shows. */
  logoCid?: string;
  /** Address, phone, email, tax number: one line each, for the footer. */
  businessDetails: string[];
  /** What the document is, e.g. "Invoice", and its number. */
  title: string;
  number: string;
  /** The figure the summary leads with: "Amount due" or "Total". */
  amount: { label: string; value: string };
  /** The rest of the summary, two to a row: dates, the total when something is paid… */
  facts: { label: string; value: string }[];
  /** The message as typed: one paragraph per line. */
  message: string;
  /** The first is the main button; the rest sit beside it, outlined. */
  links: { label: string; url: string }[];
};

/**
 * A document a business sends its customer. It speaks for the business, so it
 * carries the business's logo and name rather than Elixir Books' brand line:
 * the message, a summary card (number, dates, amount), the buttons, and the
 * business's details at the foot. Tables and inline styles, as email clients
 * ignore most of the rest.
 */
export function renderDocumentEmailHtml(e: DocumentEmail): string {
  const [main, ...rest] = e.links;
  const name = escapeHtml(e.businessName);
  const factRows: string[] = [];
  for (let i = 0; i < e.facts.length; i += 2) {
    factRows.push(
      `<tr>${e.facts
        .slice(i, i + 2)
        .map(
          (f) =>
            `<td width="50%" style="padding:12px 0 0;vertical-align:top;"><div style="font-size:12px;color:#6b7280;">${escapeHtml(f.label)}</div><div style="font-size:14px;font-weight:600;color:#1c1f23;padding-top:2px;">${escapeHtml(f.value)}</div></td>`,
        )
        .join('')}</tr>`,
    );
  }
  const button = (l: { label: string; url: string }, primary: boolean) =>
    `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;${
      primary ? 'background:#007aff;color:#ffffff;border:1px solid #007aff;' : 'background:#ffffff;color:#007aff;border:1px solid #cfd6df;'
    }">${escapeHtml(l.label)}</a>`;
  return `<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans Tamil','Tamil Sangam MN',sans-serif;color:#1c1f23;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    ${e.logoCid ? `<td style="padding-right:12px;vertical-align:middle;"><img src="cid:${escapeHtml(e.logoCid)}" alt="" height="44" style="display:block;border:0;outline:none;width:auto;height:auto;max-height:44px;max-width:150px;"></td>` : ''}
                    <td style="vertical-align:middle;font-size:18px;font-weight:700;color:#1c1f23;">${name}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e6e8eb;border-top:4px solid #007aff;border-radius:12px;padding:28px;">
                ${e.message
                  .split('\n')
                  .filter((p) => p.trim())
                  .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${escapeHtml(p)}</p>`)
                  .join('\n                ')}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 22px;background:#f7f8fa;border:1px solid #eceef1;border-radius:10px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(e.title)}</div>
                            <div style="font-size:16px;font-weight:700;color:#1c1f23;padding-top:4px;">${escapeHtml(e.number)}</div>
                          </td>
                          <td align="right" style="vertical-align:top;">
                            <div style="font-size:12px;color:#6b7280;">${escapeHtml(e.amount.label)}</div>
                            <div style="font-size:22px;font-weight:700;color:#1c1f23;padding-top:2px;white-space:nowrap;">${escapeHtml(e.amount.value)}</div>
                          </td>
                        </tr>
                      </table>
                      ${factRows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid #e6e8eb;">${factRows.join('')}</table>` : ''}
                    </td>
                  </tr>
                </table>
                <div>${[main ? button(main, true) : '', ...rest.map((l) => button(l, false))].join('')}</div>
                ${main ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">If the button doesn't open, copy this link into your browser:<br><a href="${escapeHtml(main.url)}" style="color:#007aff;word-break:break-all;">${escapeHtml(main.url)}</a></p>` : ''}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 12px 0;font-size:12px;line-height:1.6;color:#6b7280;">
                <div style="font-weight:600;color:#4b5563;">${name}</div>
                ${e.businessDetails.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 12px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:6px;font-size:11px;color:#9ca3af;">Sent with</td>
                    <td style="vertical-align:middle;padding-right:5px;"><img src="cid:${LOGO_CID}" alt="" width="11" height="16" style="display:block;border:0;outline:none;width:11px;height:16px;"></td>
                    <td style="vertical-align:middle;font-size:12px;font-weight:700;letter-spacing:0.2px;color:#2e3590;">Elixir Books</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderEmailHtml(e: EmailLayout): string {
  const link = escapeHtml(e.link);
  // Inline styles and a table layout: email clients ignore most of the rest.
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans Tamil','Tamil Sangam MN',sans-serif;color:#1c1f23;">
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
