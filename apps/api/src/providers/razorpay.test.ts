import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { createPaymentsProvider } from './payments';

const provider = () => createPaymentsProvider(loadConfig({ PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' }));
const checkout = { companyId: 'cmp_1', plan: 'pro', planName: 'Pro', cycle: 'yearly' as const, amountMinor: 999_900, currency: 'INR', customer: { name: 'Vertex' } };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('Razorpay subscriptions', () => {
  it('reuses the plan already in Razorpay instead of creating another after a restart', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes('/plans?')
        ? json({ items: [{ id: 'plan_other', notes: { key: 'pro:monthly:99900:INR' } }, { id: 'plan_existing', notes: { key: 'pro:yearly:999900:INR' } }] })
        : json({ id: 'sub_1', short_url: 'https://rzp.io/i/x' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await provider().createSubscriptionCheckout(checkout);
    const calls = fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`);
    expect(calls.some((c) => c.startsWith('POST') && c.endsWith('/plans'))).toBe(false);
    const sub = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/subscriptions'))!;
    expect(JSON.parse((sub[1] as RequestInit).body as string).plan_id).toBe('plan_existing');
  });

  it('creates the plan, tagged with its key, when none matches, then remembers it', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.includes('/plans?') ? json({ items: [] }) : url.endsWith('/plans') && init?.method === 'POST' ? json({ id: 'plan_new' }) : json({ id: 'sub_1', short_url: 'https://rzp.io/i/x' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const p = provider();
    await p.createSubscriptionCheckout(checkout);
    await p.createSubscriptionCheckout(checkout);
    const created = fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/plans') && (init as RequestInit).method === 'POST');
    expect(created).toHaveLength(1);
    expect(JSON.parse((created[0][1] as RequestInit).body as string).notes.key).toBe('pro:yearly:999900:INR');
  });

  it('gives up on a gateway that never answers', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().createPaymentLink({ amountMinor: 100, currency: 'INR', description: 'x', referenceId: 'r' } as never)).rejects.toThrow(/timeout/);
  });
});
