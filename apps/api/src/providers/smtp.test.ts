import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const { loadConfig } = await import('../config');
const { createMessaging, Outbox } = await import('./messaging');

const emailWith = (env: Record<string, string>) => createMessaging(loadConfig(env), new Outbox(), () => {}).email;

const env = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.office365.com',
  SMTP_PORT: '587',
  SMTP_USER: 'no-reply@example.com',
  SMTP_PASS: 'secret',
  EMAIL_FROM: 'Elixir Books <no-reply@example.com>',
};

beforeEach(() => {
  sendMail.mockReset();
  createTransport.mockClear();
});

describe('SMTP email provider', () => {
  it('connects with the host, port and login from the environment and sends the message', async () => {
    sendMail.mockResolvedValue({ messageId: '<m1@example.com>', rejected: [], accepted: ['a@b.com'] });
    const out = await emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' });
    expect(out.providerMessageId).toBe('<m1@example.com>');
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.office365.com', port: 587, secure: false, auth: { user: 'no-reply@example.com', pass: 'secret' } }));
    expect(sendMail).toHaveBeenCalledWith({ from: 'Elixir Books <no-reply@example.com>', to: 'a@b.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' });
  });

  it('reads SMTP_SECURE=true as an implicit-TLS connection', async () => {
    sendMail.mockResolvedValue({ messageId: 'x', rejected: [] });
    await emailWith({ ...env, SMTP_PORT: '465', SMTP_SECURE: 'true' }).send({ to: 'a@b.com', subject: 'Hi', text: 'x' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it('sends the logo as an inline attachment when the HTML refers to it', async () => {
    sendMail.mockResolvedValue({ messageId: 'x', rejected: [] });
    await emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'plain', html: '<img src="cid:elixir-logo">' });
    const sent = sendMail.mock.calls[0][0];
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0]).toMatchObject({ cid: 'elixir-logo', contentType: 'image/png', encoding: 'base64' });
    expect(Buffer.from(sent.attachments[0].content, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('adds the reply-to address when one is configured', async () => {
    sendMail.mockResolvedValue({ messageId: 'x', rejected: [] });
    await emailWith({ ...env, EMAIL_REPLY_TO: 'support@example.com' }).send({ to: 'a@b.com', subject: 'Hi', text: 'x' });
    expect(sendMail.mock.calls[0][0].replyTo).toBe('support@example.com');
  });

  it('throws when the server refuses to send (wrong password, blocked mailbox)', async () => {
    sendMail.mockRejectedValue(new Error('535 5.7.3 Authentication unsuccessful'));
    await expect(emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'x' })).rejects.toThrow(/Authentication unsuccessful/);
  });

  it('throws when the recipient is rejected', async () => {
    sendMail.mockResolvedValue({ messageId: 'x', rejected: ['a@b.com'] });
    await expect(emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'x' })).rejects.toThrow(/SMTP rejected a@b.com/);
  });
});
