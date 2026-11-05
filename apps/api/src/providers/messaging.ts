import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { EmailClient } from '@azure/communication-email';
import type { Config } from '../config';
import { LOGO_CID, LOGO_PNG_BASE64 } from '../lib/emailLogo';
import { sendPay4smsOtp } from './pay4sms';

export type SentMessage = { channel: 'sms' | 'email' | 'whatsapp' | 'push'; to: string; subject?: string; text: string; html?: string; inline?: InlineImage[]; at: Date };

/** In-process outbox. The log providers write here; tests read OTPs and links from it. */
export class Outbox {
  readonly messages: SentMessage[] = [];
  push(m: Omit<SentMessage, 'at'>) {
    this.messages.push({ ...m, at: new Date() });
  }
  last(channel: SentMessage['channel'], to?: string): SentMessage | undefined {
    return [...this.messages].reverse().find((m) => m.channel === channel && (!to || m.to === to));
  }
  clear() {
    this.messages.length = 0;
  }
}

export type SendResult = { providerMessageId: string };

export interface SmsProvider {
  /** `meta` marks a sign-in code for providers that can only send a registered template. */
  send(to: string, text: string, meta?: { kind: 'otp'; code: string; name?: string }): Promise<SendResult>;
}
/** The logo goes along as an inline attachment when the email's HTML refers to it. */
const inlineLogo = (html?: string) => (html?.includes(`cid:${LOGO_CID}`) ? { name: 'logo.png', contentType: 'image/png', base64: LOGO_PNG_BASE64, cid: LOGO_CID } : undefined);

/** An image carried inside the email, referred to from its HTML as `cid:<cid>`. */
export type InlineImage = { cid: string; name: string; contentType: string; base64: string };

export interface EmailProvider {
  send(msg: { to: string; subject: string; text: string; html?: string; inline?: InlineImage[] }): Promise<SendResult>;
}

/** Every image the email carries: the Elixir Books mark when its HTML uses it, and any the sender added. */
const inlineImages = (msg: { html?: string; inline?: InlineImage[] }): InlineImage[] => {
  const logo = inlineLogo(msg.html);
  return [...(logo ? [logo] : []), ...(msg.inline ?? [])];
};
export interface WhatsAppProvider {
  /** Sends text, optionally with a document link (a PDF share link). */
  send(msg: { to: string; text: string; documentUrl?: string; filename?: string }): Promise<SendResult>;
}
export type PushMessage = { title: string; body: string; data?: Record<string, string>; /** Android channel. */ channelId?: string };
/** What the push service said: a ticket per accepted message, and tokens it already knows are gone. */
export type PushOutcome = { tickets: { token: string; ticketId: string }[]; deadTokens: string[] };

export interface PushProvider {
  send(tokens: string[], msg: PushMessage): Promise<PushOutcome>;
  /** Of these tickets, the ones whose device is gone (uninstalled, signed out of the store account). */
  deadTickets(ticketIds: string[]): Promise<string[]>;
}

const EXPO_PUSH = 'https://exp.host/--/api/v2/push';
/** Expo takes at most 100 messages, and 1000 receipt ids, per request. */
const chunk = <T>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

type ExpoTicket = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };

/**
 * The bare address from `Name <addr>`. ACS takes only the address; the display
 * name is set on the sender username in Azure.
 */
export function emailAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

let seq = 0;
const localId = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function createMessaging(config: Config, outbox: Outbox, log: (msg: string) => void, debug?: (msg: string) => void) {
  const sms: SmsProvider =
    config.SMS_PROVIDER === 'pay4sms'
      ? {
          async send(to, text, meta) {
            if (meta?.kind !== 'otp') {
              // DLT: free text would be dropped silently by the operator.
              outbox.push({ channel: 'sms', to, text });
              log(`pay4sms: non-OTP SMS not sent, no DLT template registered [sms → ${to}] ${text}`);
              return { providerMessageId: localId('sms') };
            }
            await sendPay4smsOtp(config.PAY4SMS_TOKEN ?? '', { phone: to, code: meta.code, name: meta.name }, debug);
            return { providerMessageId: localId('pay4sms') };
          },
        }
      : config.SMS_PROVIDER === 'msg91'
      ? {
          async send(to, text) {
            const res = await fetch('https://control.msg91.com/api/v5/flow/', {
              method: 'POST',
              headers: { authkey: config.MSG91_AUTH_KEY ?? '', 'content-type': 'application/json' },
              body: JSON.stringify({ template_id: config.MSG91_TEMPLATE_ID, recipients: [{ mobiles: to.replace(/^\+/, ''), message: text }] }),
            });
            if (!res.ok) throw new Error(`MSG91 ${res.status}`);
            const body = (await res.json()) as { message?: string };
            return { providerMessageId: body.message ?? localId('msg91') };
          },
        }
      : {
          async send(to, text) {
            outbox.push({ channel: 'sms', to, text });
            log(`[sms → ${to}] ${text}`);
            return { providerMessageId: localId('sms') };
          },
        };

  let ses: SESv2Client | null = null;
  let acs: EmailClient | null = null;
  // Add a provider by adding a branch here and a value to EMAIL_PROVIDER; callers only see EmailProvider.
  const email: EmailProvider =
    config.EMAIL_PROVIDER === 'resend'
      ? {
          async send(msg) {
            // Plain fetch against Resend's REST API, so there is no SDK to carry.
            const images = inlineImages(msg);
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { authorization: `Bearer ${config.RESEND_API_KEY ?? ''}`, 'content-type': 'application/json' },
              body: JSON.stringify({ from: config.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}), ...(config.EMAIL_REPLY_TO ? { reply_to: config.EMAIL_REPLY_TO } : {}), ...(images.length ? { attachments: images.map((i) => ({ filename: i.name, content: i.base64, content_type: i.contentType, content_id: i.cid })) } : {}) }),
            });
            const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
            if (!res.ok) throw new Error(`Resend ${res.status}${body.message ? `: ${body.message}` : ''}`);
            return { providerMessageId: body.id ?? localId('resend') };
          },
        }
      : config.EMAIL_PROVIDER === 'acs'
      ? {
          async send(msg) {
            acs ??= new EmailClient(config.ACS_CONNECTION_STRING ?? '');
            const images = inlineImages(msg);
            const poller = await acs.beginSend({
              senderAddress: emailAddress(config.EMAIL_FROM),
              content: { subject: msg.subject, plainText: msg.text, ...(msg.html ? { html: msg.html } : {}) },
              recipients: { to: [{ address: msg.to }] },
              ...(config.EMAIL_REPLY_TO ? { replyTo: [{ address: config.EMAIL_REPLY_TO }] } : {}),
              ...(images.length ? { attachments: images.map((i) => ({ name: i.name, contentType: i.contentType, contentInBase64: i.base64, contentId: i.cid })) } : {}),
            });
            const out = await poller.pollUntilDone();
            if (out.status !== 'Succeeded') throw new Error(`ACS email ${out.status}${out.error?.message ? `: ${out.error.message}` : ''}`);
            return { providerMessageId: out.id };
          },
        }
      : config.EMAIL_PROVIDER === 'ses'
      ? {
          async send(msg) {
            ses ??= new SESv2Client({ region: config.S3_REGION });
            const out = await ses.send(
              new SendEmailCommand({
                FromEmailAddress: config.EMAIL_FROM,
                Destination: { ToAddresses: [msg.to] },
                Content: {
                  Simple: {
                    Subject: { Data: msg.subject },
                    Body: { Text: { Data: msg.text }, ...(msg.html ? { Html: { Data: msg.html } } : {}) },
                  },
                },
              }),
            );
            return { providerMessageId: out.MessageId ?? localId('ses') };
          },
        }
      : {
          async send(msg) {
            outbox.push({ channel: 'email', to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, inline: msg.inline });
            log(`[email → ${msg.to}] ${msg.subject}\n${msg.text}`);
            return { providerMessageId: localId('email') };
          },
        };

  const whatsapp: WhatsAppProvider =
    config.WHATSAPP_PROVIDER === 'meta'
      ? {
          async send(msg) {
            const to = msg.to.replace(/^\+/, '');
            const payload = msg.documentUrl
              ? { messaging_product: 'whatsapp', to, type: 'document', document: { link: msg.documentUrl, filename: msg.filename, caption: msg.text } }
              : { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.text } };
            const res = await fetch(`https://graph.facebook.com/v21.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
              method: 'POST',
              headers: { authorization: `Bearer ${config.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`WhatsApp ${res.status}`);
            const body = (await res.json()) as { messages?: { id: string }[] };
            return { providerMessageId: body.messages?.[0]?.id ?? localId('wa') };
          },
        }
      : {
          async send(msg) {
            outbox.push({ channel: 'whatsapp', to: msg.to, text: msg.documentUrl ? `${msg.text}\n${msg.documentUrl}` : msg.text });
            log(`[whatsapp → ${msg.to}] ${msg.text}`);
            return { providerMessageId: localId('wa') };
          },
        };

  const push: PushProvider =
    config.PUSH_PROVIDER === 'expo'
      ? {
          async send(tokens, msg) {
            const outcome: PushOutcome = { tickets: [], deadTokens: [] };
            for (const part of chunk(tokens, 100)) {
              const res = await fetch(`${EXPO_PUSH}/send`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify(part.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data, sound: 'default', channelId: msg.channelId }))),
                signal: AbortSignal.timeout(15_000),
              });
              if (!res.ok) throw new Error(`Expo push ${res.status}`);
              const { data } = (await res.json()) as { data?: ExpoTicket[] };
              (data ?? []).forEach((ticket, i) => {
                if (ticket.status === 'ok' && ticket.id) outcome.tickets.push({ token: part[i], ticketId: ticket.id });
                else if (ticket.details?.error === 'DeviceNotRegistered') outcome.deadTokens.push(part[i]);
              });
            }
            return outcome;
          },
          async deadTickets(ticketIds) {
            const dead: string[] = [];
            for (const part of chunk(ticketIds, 1000)) {
              const res = await fetch(`${EXPO_PUSH}/getReceipts`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({ ids: part }),
                signal: AbortSignal.timeout(15_000),
              });
              if (!res.ok) throw new Error(`Expo receipts ${res.status}`);
              const { data } = (await res.json()) as { data?: Record<string, ExpoTicket> };
              for (const [id, receipt] of Object.entries(data ?? {})) if (receipt.details?.error === 'DeviceNotRegistered') dead.push(id);
            }
            return dead;
          },
        }
      : {
          async send(tokens, msg) {
            for (const to of tokens) outbox.push({ channel: 'push', to, subject: msg.title, text: msg.body });
            return { tickets: [], deadTokens: [] };
          },
          async deadTickets() {
            return [];
          },
        };

  return { sms, email, whatsapp, push };
}
