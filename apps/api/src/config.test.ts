import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config';

/** Every provider real and credentialed: the baseline each case breaks one thing in. */
const ready = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(32),
  CREDENTIALS_KEY: Buffer.alloc(32, 1).toString('base64'),
  CORS_ORIGINS: 'https://app.example.in,https://admin.example.in',
  SMS_PROVIDER: 'msg91',
  MSG91_AUTH_KEY: 'k',
  MSG91_TEMPLATE_ID: 't',
  EMAIL_PROVIDER: 'acs',
  ACS_CONNECTION_STRING: 'endpoint=https://x.communication.azure.com/;accesskey=a2V5',
  EMAIL_FROM: 'Elixir Books <DoNotReply@example.azurecomm.net>',
  WHATSAPP_PROVIDER: 'meta',
  WHATSAPP_TOKEN: 'w',
  WHATSAPP_PHONE_NUMBER_ID: '1',
  WHATSAPP_WEBHOOK_SECRET: 'whatsapp-live-secret',
  PUSH_PROVIDER: 'expo',
  STORAGE_PROVIDER: 's3',
  PDF_PROVIDER: 'chromium',
  COMPLIANCE_PROVIDER: 'gsp',
  TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.in',
  TAXATION_ADAEQUARE_APP_ID: 'app-id',
  TAXATION_ADAEQUARE_APP_SECRET: 'app-secret',
  GSTIN_PROVIDER: 'disabled',
  OCR_PROVIDER: 'disabled',
  FX_PROVIDER: 'openexchangerates',
  OPENEXCHANGERATES_APP_ID: 'o',
  PAYMENTS_PROVIDER: 'razorpay',
  RAZORPAY_KEY_ID: 'rzp_live_x',
  RAZORPAY_KEY_SECRET: 's',
  RAZORPAY_WEBHOOK_SECRET: 'razorpay-live-secret',
  ASSISTANT_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'sk-ant-x',
};

describe('production config guards', () => {
  it('accepts a fully configured production environment, GSTIN and OCR disabled', () => {
    const config = loadConfig(ready);
    expect(config.GSTIN_PROVIDER).toBe('disabled');
    expect(config.OCR_PROVIDER).toBe('disabled');
  });

  it('keeps every simulator available outside production', () => {
    const config = loadConfig({});
    expect([config.SMS_PROVIDER, config.PDF_PROVIDER, config.COMPLIANCE_PROVIDER, config.FX_PROVIDER, config.CORS_ORIGINS]).toEqual(['log', 'stub', 'simulator', 'static', '*']);
    expect(loadConfig({ NODE_ENV: 'test' }).ASSISTANT_PROVIDER).toBe('simulator');
  });

  it('lists every problem at once with the production defaults', () => {
    let message = '';
    try {
      loadConfig({ NODE_ENV: 'production' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/^Refusing to start in production:/);
    for (const key of ['JWT_SECRET', 'CREDENTIALS_KEY', 'CORS_ORIGINS', 'SMS_PROVIDER=log', 'EMAIL_PROVIDER=log', 'WHATSAPP_PROVIDER=log', 'PUSH_PROVIDER=log', 'PDF_PROVIDER=stub', 'COMPLIANCE_PROVIDER=simulator', 'PAYMENTS_PROVIDER=simulator', 'ASSISTANT_PROVIDER=simulator', 'GSTIN_PROVIDER=simulator', 'OCR_PROVIDER=simulator', 'FX_PROVIDER=static', 'STORAGE_PROVIDER=memory', 'RAZORPAY_WEBHOOK_SECRET', 'WHATSAPP_WEBHOOK_SECRET']) {
      expect(message).toContain(key);
    }
  });

  it.each([
    ['SMS_PROVIDER', 'log'],
    ['EMAIL_PROVIDER', 'log'],
    ['WHATSAPP_PROVIDER', 'log'],
    ['PUSH_PROVIDER', 'log'],
    ['PDF_PROVIDER', 'stub'],
    ['COMPLIANCE_PROVIDER', 'simulator'],
    ['PAYMENTS_PROVIDER', 'simulator'],
    ['ASSISTANT_PROVIDER', 'simulator'],
    ['GSTIN_PROVIDER', 'simulator'],
    ['OCR_PROVIDER', 'simulator'],
    ['FX_PROVIDER', 'static'],
    ['STORAGE_PROVIDER', 'memory'],
  ])('refuses %s=%s', (key, value) => {
    expect(() => loadConfig({ ...ready, [key]: value })).toThrow(`${key}=${value}`);
  });

  it.each([
    ['MSG91_AUTH_KEY', /MSG91_AUTH_KEY/],
    ['MSG91_TEMPLATE_ID', /MSG91_TEMPLATE_ID/],
    ['ACS_CONNECTION_STRING', /ACS_CONNECTION_STRING/],
    ['WHATSAPP_TOKEN', /WHATSAPP_TOKEN/],
    ['WHATSAPP_PHONE_NUMBER_ID', /WHATSAPP_PHONE_NUMBER_ID/],
    ['TAXATION_ADAEQUARE_BASE_URL', /TAXATION_ADAEQUARE_BASE_URL/],
    ['TAXATION_ADAEQUARE_APP_ID', /TAXATION_ADAEQUARE_APP_ID/],
    ['TAXATION_ADAEQUARE_APP_SECRET', /TAXATION_ADAEQUARE_APP_SECRET/],
    ['RAZORPAY_KEY_ID', /RAZORPAY_KEY_ID/],
    ['RAZORPAY_KEY_SECRET', /RAZORPAY_KEY_SECRET/],
    ['OPENEXCHANGERATES_APP_ID', /OPENEXCHANGERATES_APP_ID/],
    ['ANTHROPIC_API_KEY', /ANTHROPIC_API_KEY/],
    ['EMAIL_FROM', /EMAIL_FROM/],
  ])('requires %s for the provider that uses it', (key, pattern) => {
    expect(() => loadConfig({ ...ready, [key]: undefined })).toThrow(pattern);
  });

  it('requires AWS credentials for SES', () => {
    const ses = { ...ready, EMAIL_PROVIDER: 'ses' };
    expect(() => loadConfig(ses)).toThrow(/AWS credentials/);
    expect(loadConfig({ ...ses, AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' }).EMAIL_PROVIDER).toBe('ses');
  });

  it('refuses the development webhook secrets', () => {
    expect(() => loadConfig({ ...ready, RAZORPAY_WEBHOOK_SECRET: undefined })).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
    expect(() => loadConfig({ ...ready, WHATSAPP_WEBHOOK_SECRET: 'dev-whatsapp-secret' })).toThrow(/WHATSAPP_WEBHOOK_SECRET/);
  });

  it("refuses CORS_ORIGINS='*', alone or in a list", () => {
    expect(() => loadConfig({ ...ready, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadConfig({ ...ready, CORS_ORIGINS: 'https://app.example.in, *' })).toThrow(/CORS_ORIGINS/);
  });

  it('still refuses the demo OTP and dev secrets', () => {
    expect(() => loadConfig({ ...ready, DEMO_OTP: 'true' })).toThrow(/DEMO_OTP/);
    expect(() => loadConfig({ ...ready, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...ready, CREDENTIALS_KEY: undefined })).toThrow(/CREDENTIALS_KEY/);
  });

  describe('GSP gateway', () => {
    it('falls back to the older GSP_BASE_URL', () => {
      expect(() => loadConfig({ ...ready, TAXATION_ADAEQUARE_BASE_URL: undefined })).toThrow(/TAXATION_ADAEQUARE_BASE_URL/);
      expect(loadConfig({ ...ready, TAXATION_ADAEQUARE_BASE_URL: undefined, GSP_BASE_URL: 'https://gsp.example.in' }).COMPLIANCE_PROVIDER).toBe('gsp');
    });

    it('refuses Whitebooks unless the sandbox is allowed, however it is selected', () => {
      expect(() => loadConfig({ ...ready, TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP' })).toThrow(/sandbox only/);
      expect(() => loadConfig({ ...ready, TAXATION_TAXPAYER_PROVIDER: 'whitebooks' })).toThrow(/sandbox only/);
    });

    it('allows the sandbox GSP by TAXATION_GSTIN_ALLOW_SANDBOX alone, whatever NODE_ENV says', () => {
      const sandbox = {
        ...ready,
        TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP',
        TAXATION_WHITEBOOKS_BASE_URL: 'https://apisandbox.example.in',
        TAXATION_WHITEBOOKS_EINVOICE_APP_ID: 'EINS-id',
        TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: 'EINS-secret',
        TAXATION_SANDBOX_BUYER_GSTIN: '29AWGPV7107B1Z1',
        TAXATION_GSP_AUTH_REQUIRED: 'false',
      };
      // Off: each sandbox-only setting is refused, in production and out of it.
      expect(() => loadConfig(sandbox)).toThrow(/sandbox only/);
      expect(() => loadConfig({ ...sandbox, NODE_ENV: 'development' })).toThrow(/TAXATION_GSTIN_ALLOW_SANDBOX/);
      // On: allowed, in production too. The other production checks stay on.
      expect(loadConfig({ ...sandbox, TAXATION_GSTIN_ALLOW_SANDBOX: 'true' }).TAXATION_GSP_PROVIDER_CODE).toBe('WHITE_BOOKS_GSP');
      expect(() => loadConfig({ ...sandbox, TAXATION_GSTIN_ALLOW_SANDBOX: 'true', SMS_PROVIDER: 'log' })).toThrow(/SMS_PROVIDER=log/);
      expect(() => loadConfig({ ...sandbox, TAXATION_GSTIN_ALLOW_SANDBOX: 'true', TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: '' })).toThrow(/EINVOICE_APP/);
    });

    it('refuses the test buyer and the unauthenticated gateway unless the sandbox is allowed', () => {
      expect(() => loadConfig({ TAXATION_SANDBOX_BUYER_GSTIN: '29AWGPV7107B1Z1' })).toThrow(/TAXATION_SANDBOX_BUYER_GSTIN/);
      expect(() => loadConfig({ TAXATION_GSP_AUTH_REQUIRED: 'false' })).toThrow(/TAXATION_GSP_AUTH_REQUIRED/);
      expect(loadConfig({ TAXATION_GSTIN_ALLOW_SANDBOX: 'true', TAXATION_SANDBOX_BUYER_GSTIN: '29AWGPV7107B1Z1' }).TAXATION_SANDBOX_BUYER_GSTIN).toBe('29AWGPV7107B1Z1');
    });

    it('refuses a half-set application pair, outside production too', () => {
      expect(() => loadConfig({ TAXATION_GSP_EINVOICE_APP_ID: 'EINS1' })).toThrow(/TAXATION_GSP_EINVOICE_APP_SECRET/);
      expect(() => loadConfig({ TAXATION_GSP_APP_SECRET: 's' })).toThrow(/TAXATION_GSP_APP_ID/);
    });

    it('refuses an unknown TAXATION_TAXPAYER_PROVIDER', () => {
      expect(() => loadConfig({ TAXATION_TAXPAYER_PROVIDER: 'cleartax' })).toThrow(/TAXATION_TAXPAYER_PROVIDER/);
    });

    it('is happy with nothing at all in development', () => {
      const config = loadConfig({});
      expect(config.TAXATION_GSP_PROVIDER_CODE).toBe('ADAEQUARE_GSP');
      expect(config.TAXATION_GSP_AUTH_REQUIRED).toBe(true);
    });
  });

  it('ALLOW_UNCONFIGURED_PROVIDERS starts with providers unset, but not with dev secrets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = { NODE_ENV: 'production', ALLOW_UNCONFIGURED_PROVIDERS: 'true', JWT_SECRET: 'x'.repeat(32), CREDENTIALS_KEY: ready.CREDENTIALS_KEY };
    expect(loadConfig(base).SMS_PROVIDER).toBe('log');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('STORAGE_PROVIDER=memory'));
    expect(() => loadConfig({ ...base, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, CREDENTIALS_KEY: undefined })).toThrow(/CREDENTIALS_KEY/);
    expect(() => loadConfig({ ...base, DEMO_OTP: 'true' })).toThrow(/DEMO_OTP/);
    warn.mockRestore();
  });
});
