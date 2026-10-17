import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';

export const MIN_REASON = 3;

type Props = {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Extra fields rendered above the reason. */
  children?: ReactNode;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
};

/**
 * Every operator action goes through here: it needs a written reason, which
 * lands in the platform audit log with the action.
 */
export function ReasonDialog({ open, title, description, confirmLabel, danger, children, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setReason('');
      setError(null);
      // jsdom has no showModal.
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  const valid = reason.trim().length >= MIN_REASON;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="modal" aria-labelledby="reason-title" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2 id="reason-title">{title}</h2>
        <div className="muted">{description}</div>
        {children}
        <label className="field">
          <span>Reason</span>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Support ticket #1234"
            required
          />
          <span className="hint">Recorded in the platform audit log. At least {MIN_REASON} characters.</span>
        </label>
        {error ? (
          <div className="alert bad" role="alert">
            {error}
          </div>
        ) : null}
        <div className="actions">
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger solid' : 'primary'}`} type="submit" disabled={!valid || busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
