import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Config } from '../config';

export type SentMessage = { channel: 'sms' | 'email' | 'whatsapp' | 'push'; to: string; subject?: string; text: string; at: Date };

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
  send(to: string, text: string): Promise<SendResult>;
}
export interface EmailProvider {
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<SendResult>;
}
export interface WhatsAppProvider {
  /** Sends text, optionally with a document link (a PDF share link). */
  send(msg: { to: string; text: string; documentUrl?: string; filename?: string }): Promise<SendResult>;
}
export interface PushProvider {
  send(tokens: string[], msg: { title: string; body: string; data?: Record<string, string> }): Promise<void>;
}

let seq = 0;
const localId = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function createMessaging(config: Config, outbox: Outbox, log: (msg: string) => void) {
  const sms: SmsProvider =
    config.SMS_PROVIDER === 'msg91'
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
  const email: EmailProvider =
    config.EMAIL_PROVIDER === 'ses'
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
            outbox.push({ channel: 'email', to: msg.to, subject: msg.subject, text: msg.text });
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
            if (!tokens.length) return;
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(tokens.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data }))),
            });
          },
        }
      : {
          async send(tokens, msg) {
            for (const to of tokens) outbox.push({ channel: 'push', to, subject: msg.title, text: msg.body });
          },
        };

  return { sms, email, whatsapp, push };
}
