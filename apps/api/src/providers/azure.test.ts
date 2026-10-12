import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { emailAddress } from './messaging';
import { AzureBlobStorage } from './storage';

// Azurite's well-known development key: signs SAS URLs offline, no network.
const AZURITE =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';

const production = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), CREDENTIALS_KEY: Buffer.alloc(32, 1).toString('base64') };

describe('Azure config', () => {
  it('keeps the in-process defaults outside production', () => {
    const config = loadConfig({});
    expect(config.STORAGE_PROVIDER).toBe('memory');
    expect(config.EMAIL_PROVIDER).toBe('log');
  });

  it('refuses memory storage in production', () => {
    expect(() => loadConfig(production)).toThrow(/STORAGE_PROVIDER=memory/);
  });

  it('requires the connection strings in production', () => {
    expect(() => loadConfig({ ...production, STORAGE_PROVIDER: 'azure' })).toThrow(/AZURE_STORAGE_CONNECTION_STRING/);
    expect(() => loadConfig({ ...production, STORAGE_PROVIDER: 'azure', AZURE_STORAGE_CONNECTION_STRING: AZURITE, EMAIL_PROVIDER: 'acs' })).toThrow(/ACS_CONNECTION_STRING/);
    expect(
      loadConfig({ ...production, STORAGE_PROVIDER: 'azure', AZURE_STORAGE_CONNECTION_STRING: AZURITE, EMAIL_PROVIDER: 'acs', ACS_CONNECTION_STRING: 'endpoint=https://x.communication.azure.com/;accesskey=a2V5' }).STORAGE_PROVIDER,
    ).toBe('azure');
  });
});

describe('AzureBlobStorage', () => {
  const storage = new AzureBlobStorage(loadConfig({ STORAGE_PROVIDER: 'azure', AZURE_STORAGE_CONNECTION_STRING: AZURITE, AZURE_STORAGE_CONTAINER: 'esmart' }));

  it('signs a create/write upload URL and asks for the blob-type header', async () => {
    const signed = await storage.uploadUrl('c1/att/a.pdf', 'application/pdf');
    const url = new URL(signed.url);
    expect(url.pathname).toBe('/devstoreaccount1/esmart/c1/att/a.pdf');
    expect(url.searchParams.get('sp')).toBe('cw');
    expect(url.searchParams.get('sig')).toBeTruthy();
    expect(signed.headers).toEqual({ 'content-type': 'application/pdf', 'x-ms-blob-type': 'BlockBlob' });
  });

  it('signs a read-only download URL, with the filename when given', async () => {
    const plain = new URL((await storage.downloadUrl('c1/logo.png')).url);
    expect(plain.searchParams.get('sp')).toBe('r');
    expect(plain.searchParams.get('rscd')).toBeNull();
    const named = new URL((await storage.downloadUrl('c1/inv.pdf', { filename: 'INV-1.pdf' })).url);
    expect(named.searchParams.get('rscd')).toBe('attachment; filename="INV-1.pdf"');
  });

  it('rejects a connection string without an account key', () => {
    expect(
      () => new AzureBlobStorage(loadConfig({ STORAGE_PROVIDER: 'azure', AZURE_STORAGE_CONNECTION_STRING: 'BlobEndpoint=https://acct.blob.core.windows.net/;SharedAccessSignature=sv=2024-01-01&sig=x' })),
    ).toThrow(/AccountKey/);
  });
});

describe('emailAddress', () => {
  it('takes the address out of a display-name sender', () => {
    expect(emailAddress('Elixir Books <DoNotReply@x.azurecomm.net>')).toBe('DoNotReply@x.azurecomm.net');
    expect(emailAddress(' no-reply@elixirbooks.in ')).toBe('no-reply@elixirbooks.in');
  });
});
