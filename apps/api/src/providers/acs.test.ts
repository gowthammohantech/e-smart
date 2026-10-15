import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { createMessaging, Outbox } from './messaging';

const beginSend = vi.fn();
const EmailClient = vi.fn();
vi.mock('@azure/communication-email', () => ({
  EmailClient: class {
    constructor(...args: unknown[]) {
      EmailClient(...args);
    }
    beginSend = beginSend;
  },
}));

const CONNECTION = 'endpoint=https://esmart.communication.azure.com/;accesskey=secret';
const emailWith = (env: Record<string, string>) => createMessaging(loadConfig(env), new Outbox(), () => {}).email;

beforeEach(() => {
  beginSend.mockReset();
  EmailClient.mockReset();
  beginSend.mockResolvedValue({ pollUntilDone: async () => ({ status: 'Succeeded', id: 'op_1' }) });
});

describe('Azure Communication Services email provider', () => {
  const env = { EMAIL_PROVIDER: 'acs', ACS_CONNECTION_STRING: CONNECTION, EMAIL_FROM: 'Elixir Books <DoNotReply@abc.azurecomm.net>' };

  it('sends through the connection string and sender from the environment', async () => {
    const out = await emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' });
    expect(out.providerMessageId).toBe('op_1');
    expect(EmailClient).toHaveBeenCalledWith(CONNECTION);
    expect(beginSend).toHaveBeenCalledWith({
      senderAddress: 'DoNotReply@abc.azurecomm.net',
      content: { subject: 'Hi', plainText: 'plain', html: '<p>html</p>' },
      recipients: { to: [{ address: 'a@b.com' }] },
    });
  });

  it('attaches the logo inline and sets the reply-to when configured', async () => {
    await emailWith({ ...env, EMAIL_REPLY_TO: 'help@example.com' }).send({ to: 'a@b.com', subject: 'Hi', text: 'x', html: '<img src="cid:elixir-logo">' });
    const sent = beginSend.mock.calls[0][0];
    expect(sent.replyTo).toEqual([{ address: 'help@example.com' }]);
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0]).toMatchObject({ contentId: 'elixir-logo', contentType: 'image/png' });
    expect(Buffer.from(sent.attachments[0].contentInBase64, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('throws with the service message when sending does not succeed', async () => {
    beginSend.mockResolvedValue({ pollUntilDone: async () => ({ status: 'Failed', id: 'op_2', error: { message: 'sender not allowed' } }) });
    await expect(emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'x' })).rejects.toThrow(/ACS email Failed: sender not allowed/);
  });

  it('refuses a malformed connection string or a missing one when the API starts in production', () => {
    const prod = { NODE_ENV: 'production', EMAIL_PROVIDER: 'acs', EMAIL_FROM: env.EMAIL_FROM };
    expect(() => loadConfig({ ...prod })).toThrow(/ACS_CONNECTION_STRING must be set/);
    expect(() => loadConfig({ ...prod, ACS_CONNECTION_STRING: 'nonsense' })).toThrow(/must look like endpoint=/);
  });
});
