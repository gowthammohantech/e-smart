import { ApiError, type Schema } from '@esmart/api-client';
import type { DocumentKind } from '@esmart/core/types';
import { api, isNetworkError } from '../../remote/api';
import { isRemote } from '../../remote/config';
import { useAppStore } from '../../store/appStore';
import type { LixiAction, LixiReply } from './brain';

/**
 * Lixi on the server's model, in remote mode. The server answers from the
 * books through the same routes the app uses, and never writes: a draft, a
 * payment or a message comes back as a pending action the user confirms
 * here. When the server can't be reached the chat falls back to the local,
 * rule-based brain, so Lixi keeps working offline.
 */

export type LixiTurn = { role: 'user' | 'assistant'; text: string };
export type PendingLixiAction = Schema<'LixiPendingAction'>;
export type RemoteAnswer = { reply: LixiReply; pendingAction?: PendingLixiAction };

type WireReply = Schema<'LixiReply'>;

/** Keeps the last few turns; enough context, a bounded request. */
const MAX_TURNS = 20;

export function toReply(wire: WireReply): LixiReply {
  const actions = wire.actions.flatMap((a): LixiAction[] => {
    if (a.type === 'route' && a.route) return [{ type: 'route', label: a.label, route: a.route }];
    if (a.type === 'document' && a.id && a.kind) return [{ type: 'document', label: a.label, kind: a.kind as DocumentKind, id: a.id }];
    if (a.type === 'ask') return [{ type: 'ask', label: a.label, question: a.question ?? a.label }];
    return [];
  });
  return { text: wire.text, ...(wire.stats.length ? { stats: wire.stats } : {}), ...(actions.length ? { actions } : {}) };
}

/** Whether to ask the server at all: remote mode with a company open. */
export function remoteLixiAvailable(): boolean {
  return isRemote() && !!useAppStore.getState().activeCompanyId;
}

const companyPath = () => ({ companyId: useAppStore.getState().activeCompanyId });

/** A failure the local brain should cover: offline, or the model is down. */
function unavailable(err: unknown): boolean {
  return isNetworkError(err) || (err instanceof ApiError && (err.status >= 500 || err.status === 429));
}

/**
 * Asks the server. Resolves to null when it can't answer, and the caller
 * uses the local brain instead.
 */
export async function askRemote(history: LixiTurn[], locale?: string): Promise<RemoteAnswer | null> {
  try {
    const { data } = await api.POST('/companies/{companyId}/lixi/messages', {
      params: { path: companyPath() },
      body: { messages: history.slice(-MAX_TURNS), ...(locale ? { locale } : {}) },
    });
    if (!data) return null;
    return { reply: toReply(data.reply), ...(data.pendingAction ? { pendingAction: data.pendingAction } : {}) };
  } catch (err) {
    if (unavailable(err)) return null;
    throw err;
  }
}

export type ConfirmOutcome = { ok: true; reply: LixiReply } | { ok: false; expired: boolean; reason: string };

/** Runs an action the user confirmed. */
export async function confirmRemote(action: PendingLixiAction): Promise<ConfirmOutcome> {
  try {
    const { data } = await api.POST('/companies/{companyId}/lixi/actions', { params: { path: companyPath() }, body: { token: action.token } });
    if (!data) return { ok: false, expired: false, reason: '' };
    return { ok: true, reply: toReply(data.reply) };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, expired: err.code === 'LIXI_ACTION_EXPIRED', reason: err.message };
    if (isNetworkError(err)) return { ok: false, expired: false, reason: 'offline' };
    throw err;
  }
}
