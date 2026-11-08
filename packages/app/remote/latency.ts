import { create } from 'zustand';
import type { RequestTiming } from '@esmart/api-client';

/** How many recent requests the readout looks at. */
const KEEP = 20;

/** The last few answered requests, newest last. In memory only. */
export const useLatency = create<{ samples: RequestTiming[] }>()(() => ({ samples: [] }));

export function recordTiming(timing: RequestTiming) {
  const samples = useLatency.getState().samples;
  useLatency.setState({ samples: [...samples.slice(-(KEEP - 1)), timing] });
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type LatencySummary = {
  /** Median round trip of the recent requests: one slow upload or report doesn't swing it. */
  ms: number;
  /** Median of the server's own share, when it reported one. */
  serverMs?: number;
  /** The rest of the round trip: the network, and the browser. */
  networkMs?: number;
  slowestMs: number;
  count: number;
  lastAt: number;
};

export function summarise(samples: RequestTiming[]): LatencySummary | null {
  const ms = median(samples.map((s) => s.ms));
  if (ms === undefined) return null;
  const serverMs = median(samples.flatMap((s) => (s.serverMs === undefined ? [] : [s.serverMs])));
  return {
    ms,
    serverMs,
    networkMs: serverMs === undefined ? undefined : Math.max(0, ms - serverMs),
    slowestMs: Math.max(...samples.map((s) => s.ms)),
    count: samples.length,
    lastAt: samples[samples.length - 1].at,
  };
}

/** Fast under 300 ms, slow from a second; how the readout is coloured. */
export function latencyTone(ms: number): 'good' | 'fair' | 'slow' {
  return ms < 300 ? 'good' : ms < 1000 ? 'fair' : 'slow';
}
