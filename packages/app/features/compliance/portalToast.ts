import type { ToastApi, ToastContent, ToastIcon } from '@esmart/ui/components/Toast';

type Outcome = { ok: boolean; issues: { message: string }[] };

const isOutcome = (v: unknown): v is Outcome => typeof v === 'object' && v !== null && 'ok' in v && 'issues' in v;

/**
 * A portal call (IRN, e-way bill) under a promise toast: "working…" while it
 * is out, then the success line or the portal's first complaint. A refusal is
 * an outcome, not a thrown error, so it resolves to the outcome either way and
 * the caller still reads its issues.
 */
export function portalToast<T extends Outcome>(
  toast: ToastApi,
  call: Promise<T>,
  messages: { loading: string; success: ToastContent | ((outcome: T) => ToastContent); failed: string; icon?: ToastIcon },
): Promise<T> {
  return toast
    .promise(
      call.then((o) => (o.ok ? o : Promise.reject(o))),
      {
        loading: messages.loading,
        success: messages.success,
        error: (err) => (isOutcome(err) ? err.issues[0]?.message : undefined) ?? messages.failed,
        icon: messages.icon,
      },
    )
    .catch((err: unknown) => {
      if (isOutcome(err)) return err as T;
      throw err;
    });
}
