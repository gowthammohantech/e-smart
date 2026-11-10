import { PostHog } from 'posthog-node';
import type { Config } from '../config';

export type CapturedEvent = {
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
  groups?: Record<string, string>;
};

export type GroupUpdate = { groupType: string; groupKey: string; properties: Record<string, unknown> };

/**
 * Product analytics (PostHog Cloud, EU). Callers go through `track()` in ./track, which applies
 * the opt-out, demo and whitelist rules; nothing here checks them.
 */
export interface AnalyticsClient {
  capture(e: CapturedEvent): void;
  groupIdentify(g: GroupUpdate): void;
  captureException(err: unknown, distinctId: string | undefined, properties: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}

/**
 * The stand-in when no PostHog key is set (development, tests): keeps what would have been sent,
 * like the messaging Outbox, so tests can assert on it.
 */
export class MemoryAnalytics implements AnalyticsClient {
  readonly events: CapturedEvent[] = [];
  readonly groups: GroupUpdate[] = [];
  readonly exceptions: { distinctId?: string; properties: Record<string, unknown> }[] = [];
  private static readonly KEEP = 1000;

  capture(e: CapturedEvent) {
    this.events.push(e);
    if (this.events.length > MemoryAnalytics.KEEP) this.events.shift();
  }
  groupIdentify(g: GroupUpdate) {
    this.groups.push(g);
    if (this.groups.length > MemoryAnalytics.KEEP) this.groups.shift();
  }
  captureException(_err: unknown, distinctId: string | undefined, properties: Record<string, unknown>) {
    this.exceptions.push({ distinctId, properties });
    if (this.exceptions.length > MemoryAnalytics.KEEP) this.exceptions.shift();
  }
  named(event: string) {
    return this.events.filter((e) => e.event === event);
  }
  clear() {
    this.events.length = 0;
    this.groups.length = 0;
    this.exceptions.length = 0;
  }
  async shutdown() {}
}

class PostHogAnalytics implements AnalyticsClient {
  private readonly client: PostHog;

  constructor(key: string, host: string) {
    this.client = new PostHog(key, {
      host,
      flushAt: 20,
      flushInterval: 10_000,
      // Server events are about the person in distinct_id, not the API host's location.
      disableGeoip: true,
    });
  }

  capture(e: CapturedEvent) {
    this.client.capture({ distinctId: e.distinctId, event: e.event, properties: e.properties, ...(e.groups ? { groups: e.groups } : {}) });
  }
  groupIdentify(g: GroupUpdate) {
    this.client.groupIdentify(g);
  }
  captureException(err: unknown, distinctId: string | undefined, properties: Record<string, unknown>) {
    this.client.captureException(err, distinctId, properties);
  }
  async shutdown() {
    await this.client.shutdown(5_000);
  }
}

export function createAnalytics(config: Config): AnalyticsClient {
  const key = config.POSTHOG_API_KEY?.trim();
  if (!config.ANALYTICS_ENABLED || !key) return new MemoryAnalytics();
  return new PostHogAnalytics(key, config.POSTHOG_HOST);
}
