import { renderEmailHtml } from './emailLayout';

/** The team invitation email. Provider-neutral: it only builds the message. */

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  accountant: 'Accountant',
  sales: 'Sales',
  viewer: 'Viewer',
};

export type InviteEmailInput = {
  appUrl: string;
  token: string;
  inviteeName: string;
  inviterName: string;
  /** The businesses they are being given access to. */
  businesses: string[];
  role: string;
  expiresInDays: number;
  /** They already have an Elixir Books account, so there is no password to set. */
  existingUser?: boolean;
};

export const inviteLink = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;

function businessPhrase(names: string[]): string {
  if (names.length === 0) return 'their team';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function buildInviteEmail(i: InviteEmailInput): { subject: string; text: string; html: string } {
  const link = inviteLink(i.appUrl, i.token);
  const business = businessPhrase(i.businesses);
  const role = ROLE_LABELS[i.role] ?? i.role;
  const subject = `${i.inviterName} invited you to ${business} on Elixir Books`;
  const footer = `This link works once and expires in ${i.expiresInDays} days. If you weren't expecting this invitation, you can ignore this email.`;
  const lead = `${i.inviterName} invited you to join ${business} on Elixir Books as ${role}.`;
  const action = i.existingUser ? 'Accept the invitation to add it to your existing Elixir Books account:' : 'Accept the invitation and set your password:';

  const text = [`Hi ${i.inviteeName},`, '', lead, '', action, link, '', footer].join('\n');
  const html = renderEmailHtml({
    heading: `You're invited to ${business}`,
    paragraphs: [`Hi ${i.inviteeName},`, `**${i.inviterName}** invited you to join **${business}** as **${role}**.`],
    buttonLabel: 'Accept invitation',
    link,
    footer,
  });
  return { subject, text, html };
}
