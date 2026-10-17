import { createHmac, randomBytes } from 'node:crypto';
import type { Config } from '../config';
import { safeEqual } from '../lib/crypto';

export type PaymentLinkRequest = {
  amountMinor: number;
  currency: string;
  /** Shown to the payer, e.g. `Invoice INV/26-27/0004`. */
  description: string;
  /** Our reference, echoed back in the webhook (the document number). */
  referenceId: string;
  customer?: { name: string; email?: string; phone?: string };
  expiresAt?: Date;
  /** Echoed back as `notes` in webhooks. */
  notes?: Record<string, string>;
  /** Where the UPI intent pays to; the simulator builds a `upi://` URI with it. */
  payeeName?: string;
};

export type PaymentLink = { id: string; url: string; upiUri?: string; expiresAt?: Date };

export type SubscriptionCheckoutRequest = {
  companyId: string;
  plan: string;
  planName: string;
  cycle: 'monthly' | 'yearly';
  amountMinor: number;
  currency: string;
  customer: { name: string; email?: string };
};

export type SubscriptionCheckout = { subscriptionId: string; checkoutUrl: string; customerId?: string };

/**
 * Razorpay payment links and subscriptions, plus webhook signature checks.
 * The simulator mints links and checkouts locally; a test "pays" them by
 * posting a signed webhook, exactly as Razorpay would.
 */
export interface PaymentsProvider {
  readonly name: 'simulator' | 'razorpay';
  /** Public key the app's in-app checkout needs. */
  readonly keyId: string;
  createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLink>;
  createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<SubscriptionCheckout>;
  cancelSubscription(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void>;
  /** `X-Razorpay-Signature`: hex HMAC-SHA256 of the raw body with the webhook secret. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;
}

/** The signature Razorpay sends; exported so tests can sign their own events. */
export function signRazorpayWebhook(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function verifier(secret: string) {
  return (rawBody: string, signature: string | undefined) => !!signature && safeEqual(signature, signRazorpayWebhook(rawBody, secret));
}

const major = (minor: number) => (minor / 100).toFixed(2);

class SimulatorPayments implements PaymentsProvider {
  readonly name = 'simulator' as const;
  readonly keyId: string;
  readonly verifyWebhookSignature: PaymentsProvider['verifyWebhookSignature'];

  constructor(private readonly config: Config) {
    this.keyId = config.RAZORPAY_KEY_ID ?? 'rzp_test_simulator';
    this.verifyWebhookSignature = verifier(config.RAZORPAY_WEBHOOK_SECRET);
  }

  private id(prefix: string) {
    return `${prefix}_sim${randomBytes(9).toString('base64url')}`;
  }

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLink> {
    const id = this.id('plink');
    const upi = new URLSearchParams({ pa: 'elixirbooks@sim', pn: req.payeeName ?? 'Elixir Books', am: major(req.amountMinor), cu: req.currency, tn: req.referenceId });
    return {
      id,
      url: `${this.config.PUBLIC_BASE_URL}/pay/${id}`,
      upiUri: req.currency === 'INR' ? `upi://pay?${upi}` : undefined,
      expiresAt: req.expiresAt,
    };
  }

  async createSubscriptionCheckout(): Promise<SubscriptionCheckout> {
    const id = this.id('sub');
    return { subscriptionId: id, checkoutUrl: `${this.config.PUBLIC_BASE_URL}/checkout/${id}` };
  }

  async cancelSubscription(): Promise<void> {}
}

type RazorpayError = { error?: { code?: string; description?: string } };

class RazorpayPayments implements PaymentsProvider {
  readonly name = 'razorpay' as const;
  readonly keyId: string;
  readonly verifyWebhookSignature: PaymentsProvider['verifyWebhookSignature'];
  /** Razorpay subscriptions need a plan object; one per price, created on first use. */
  private readonly planIds = new Map<string, string>();
  private readonly auth: string;

  constructor(config: Config) {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set for PAYMENTS_PROVIDER=razorpay');
    this.keyId = config.RAZORPAY_KEY_ID;
    this.auth = `Basic ${Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
    this.verifyWebhookSignature = verifier(config.RAZORPAY_WEBHOOK_SECRET);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { authorization: this.auth, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & RazorpayError;
    if (!res.ok) throw new Error(`Razorpay ${res.status}: ${json.error?.description ?? json.error?.code ?? 'request failed'}`);
    return json;
  }

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLink> {
    const out = await this.call<{ id: string; short_url: string; expire_by?: number }>('POST', '/payment_links', {
      amount: req.amountMinor,
      currency: req.currency,
      description: req.description.slice(0, 2048),
      reference_id: req.referenceId.slice(0, 40),
      customer: req.customer ? { name: req.customer.name, email: req.customer.email, contact: req.customer.phone } : undefined,
      expire_by: req.expiresAt ? Math.floor(req.expiresAt.getTime() / 1000) : undefined,
      notes: req.notes,
      upi_link: false,
    });
    return { id: out.id, url: out.short_url, expiresAt: out.expire_by ? new Date(out.expire_by * 1000) : req.expiresAt };
  }

  private async planId(req: SubscriptionCheckoutRequest): Promise<string> {
    const key = `${req.plan}:${req.cycle}:${req.amountMinor}:${req.currency}`;
    const known = this.planIds.get(key);
    if (known) return known;
    const plan = await this.call<{ id: string }>('POST', '/plans', {
      period: req.cycle,
      interval: 1,
      item: { name: `${req.planName} (${req.cycle})`, amount: req.amountMinor, currency: req.currency },
      notes: { plan: req.plan, cycle: req.cycle },
    });
    this.planIds.set(key, plan.id);
    return plan.id;
  }

  async createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<SubscriptionCheckout> {
    const sub = await this.call<{ id: string; short_url: string; customer_id?: string }>('POST', '/subscriptions', {
      plan_id: await this.planId(req),
      // Monthly for ten years, yearly for ten: effectively until cancelled.
      total_count: req.cycle === 'monthly' ? 120 : 10,
      customer_notify: 1,
      notes: { companyId: req.companyId, plan: req.plan, cycle: req.cycle },
    });
    return { subscriptionId: sub.id, checkoutUrl: sub.short_url, customerId: sub.customer_id };
  }

  async cancelSubscription(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void> {
    await this.call('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: opts.atPeriodEnd ? 1 : 0 });
  }
}

export function createPaymentsProvider(config: Config): PaymentsProvider {
  return config.PAYMENTS_PROVIDER === 'razorpay' ? new RazorpayPayments(config) : new SimulatorPayments(config);
}
