import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schema } from '../lib/api';
import { ThirdPartyCallLogs, toCurl } from './ThirdPartyCallLogs';

const get = vi.hoisted(() => vi.fn());
vi.mock('../lib/api', async (original) => ({ ...(await original<typeof import('../lib/api')>()), api: { GET: get } }));

const call = (over: Partial<Schema<'OutboundCall'>> = {}): Schema<'OutboundCall'> => ({
  id: 'oc_1',
  createdAt: '2026-11-18T10:00:00Z',
  service: 'whitebooks',
  environment: 'sandbox',
  operation: 'Generate e-invoice (IRN)',
  method: 'POST',
  host: 'apisandbox.whitebooks.in',
  path: '/einvoice/type/GENERATE/version/V1_03',
  status: 200,
  outcome: 'envelope_error',
  durationMs: 842,
  error: 'Duplicate IRN',
  source: 'request',
  route: 'POST /v1/companies/:companyId/documents/:documentId/einvoice',
  userName: 'Asha Rao',
  companyName: 'Acme Traders',
  ...over,
});

function show() {
  get.mockImplementation(async (path: string) => {
    if (path === '/admin/outbound-calls/summary') {
      return {
        data: {
          hours: 24,
          recording: 'failures',
          retentionDays: 30,
          gspDefault: { gateway: 'adaequare', environment: 'production' },
          targets: [
            { service: 'whitebooks', environment: 'sandbox', calls: 7, failures: 2, avgMs: 400, p95Ms: 900, lastCallAt: '2026-11-18T10:00:00Z' },
            { service: 'adaequare', environment: 'production', calls: 3, failures: 0 },
          ],
        },
      };
    }
    return { data: { data: [call()], nextCursor: null } };
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ThirdPartyCallLogs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => get.mockReset());

describe('ThirdPartyCallLogs', () => {
  it('shows where calls went per target, and who set each one off', async () => {
    show();
    // Named by its tile and by the call's row.
    expect((await screen.findAllByText('Whitebooks')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(/2 failed/)).toBeTruthy();
    expect(await screen.findByText('Generate e-invoice (IRN)')).toBeTruthy();
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('Acme Traders')).toBeTruthy();
    expect(screen.getByText('Refused')).toBeTruthy();
  });

  it('filters to one target when its tile is chosen', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Whitebooks/ }));
    const last = get.mock.calls.filter(([p]) => p === '/admin/outbound-calls').at(-1)!;
    expect(last[1].params.query).toMatchObject({ service: 'whitebooks', environment: 'sandbox' });
  });
});

describe('toCurl', () => {
  it('writes the call as a command, quoting what needs it', () => {
    const out = toCurl({ method: 'POST', url: 'https://h.test/x?a=1', requestHeaders: JSON.stringify({ Authorization: 'Bearer [redacted]' }), requestBody: `{"n":"O'Neil"}` });
    expect(out).toBe(`curl -X POST 'https://h.test/x?a=1' \\\n  -H 'Authorization: Bearer [redacted]' \\\n  --data '{"n":"O'\\''Neil"}'`);
  });
});
