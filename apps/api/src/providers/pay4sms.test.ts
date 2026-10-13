import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { createMessaging, Outbox } from './messaging';
import { PAY4SMS_TEMPLATE, renderTemplate } from './pay4sms';

const OTP = { kind: 'otp', code: '482915' } as const;

function setup(env: Record<string, string> = {}) {
  const outbox = new Outbox();
  const logs: string[] = [];
  const debugs: string[] = [];
  const { sms } = createMessaging(loadConfig(env), outbox, (m) => logs.push(m), (m) => debugs.push(m));
  return { sms, outbox, logs, debugs };
}

afterEach(() => vi.unstubAllGlobals());

describe('Pay4SMS config', () => {
  it('requires PAY4SMS_TOKEN when selected', () => {
    expect(() => loadConfig({ SMS_PROVIDER: 'pay4sms' })).toThrow(/PAY4SMS_TOKEN/);
    expect(() => loadConfig({ SMS_PROVIDER: 'pay4sms', PAY4SMS_TOKEN: '  ' })).toThrow(/PAY4SMS_TOKEN/);
    expect(loadConfig({ SMS_PROVIDER: 'pay4sms', PAY4SMS_TOKEN: 't' }).SMS_PROVIDER).toBe('pay4sms');
  });

  it('does not need the token for log or msg91', () => {
    expect(loadConfig({}).SMS_PROVIDER).toBe('log');
    expect(loadConfig({ SMS_PROVIDER: 'msg91' }).SMS_PROVIDER).toBe('msg91');
  });
});

describe('renderTemplate', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    expect(renderTemplate('{a} {b}', { a: 'x' })).toBe('x {b}');
  });
});

describe('sms provider: log (default)', () => {
  it('writes to the outbox and ignores the OTP meta', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sms, outbox } = setup();
    await sms.send('+919876543210', 'hello', OTP);
    expect(outbox.last('sms')?.text).toBe('hello');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sms provider: pay4sms', () => {
  const env = { SMS_PROVIDER: 'pay4sms', PAY4SMS_TOKEN: 'secret-token' };

  it('sends an OTP through the DLT template as one GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Message Sent'));
    vi.stubGlobal('fetch', fetchMock);
    const { sms, outbox, logs, debugs } = setup(env);

    const res = await sms.send('+919876543210', 'ignored free text', OTP);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('GET');
    expect(url.origin + url.pathname).toBe('http://pay4sms.in/sendsms/');
    expect(url.searchParams.get('token')).toBe('secret-token');
    expect(url.searchParams.get('sender')).toBe('ELIXRB');
    expect(url.searchParams.get('templateid')).toBe('1707172527595886510');
    expect(url.searchParams.get('credit')).toBe('2');
    expect(url.searchParams.get('number')).toBe('9876543210');
    expect(url.searchParams.get('message')).toBe(renderTemplate(PAY4SMS_TEMPLATE, { name: 'Customer', otp: '482915' }));
    expect(res.providerMessageId).toMatch(/^pay4sms_/);
    expect(outbox.messages).toHaveLength(0);
    expect([...logs, ...debugs].join('\n')).not.toContain('482915');
    expect([...logs, ...debugs].join('\n')).not.toContain('secret-token');
  });

  it('does not send non-OTP SMS; falls back to the outbox', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sms, outbox, logs } = setup(env);

    await sms.send('+919876543210', 'Your invoice is ready');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outbox.last('sms')?.text).toBe('Your invoice is ready');
    expect(logs.join('\n')).toContain('pay4sms: non-OTP SMS not sent, no DLT template registered');
  });

  it('rejects on a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(setup(env).sms.send('+919876543210', 'x', OTP)).rejects.toThrow(/fetch failed/);
  });

  it('does not throw when the provider answers 200 with failure text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid token', { status: 200 })));
    const { sms, debugs } = setup(env);
    await expect(sms.send('+919876543210', 'x', OTP)).resolves.toBeDefined();
    expect(debugs).toEqual(['pay4sms response: Invalid token']);
  });
});
