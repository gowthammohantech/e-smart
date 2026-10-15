import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { createMessaging, Outbox } from './messaging';

const emailWith = (env: Record<string, string>) => createMessaging(loadConfig(env), new Outbox(), () => {}).email;

afterEach(() => vi.unstubAllGlobals());

describe('Resend email provider', () => {
  const env = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Elixir Books <hello@example.com>' };

  it('posts the message to Resend with the key and sender from the environment', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' });
    expect(out.providerMessageId).toBe('msg_1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body as string)).toEqual({ from: 'Elixir Books <hello@example.com>', to: ['a@b.com'], subject: 'Hi', text: 'plain', html: '<p>html</p>' });
  });

  it('sends the logo as an inline attachment when the HTML refers to it', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'plain', html: '<img src="cid:elixir-logo">' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0]).toMatchObject({ content_id: 'elixir-logo', content_type: 'image/png' });
    expect(Buffer.from(sent.attachments[0].content, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it("throws with Resend's message when it refuses", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 })));
    await expect(emailWith(env).send({ to: 'a@b.com', subject: 'Hi', text: 'x' })).rejects.toThrow(/Resend 403: domain not verified/);
  });

  it('stays on the log provider unless EMAIL_PROVIDER says otherwise', async () => {
    const outbox = new Outbox();
    const { email } = createMessaging(loadConfig({}), outbox, () => {});
    await email.send({ to: 'a@b.com', subject: 'Hi', text: 'x' });
    expect(outbox.last('email', 'a@b.com')?.subject).toBe('Hi');
  });
});
