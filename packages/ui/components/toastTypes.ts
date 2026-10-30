import type { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * What a screen can ask of a toast. Toast.tsx (the phone apps) and
 * Toast.web.tsx (the browser, built on Sileo) both implement it, so screens
 * don't know which one they got.
 */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export type ToastIcon = keyof typeof MaterialCommunityIcons.glyphMap;

export type ToastAction = { label: string; onPress: () => void };

export type ToastOptions = {
  /** What it was about, e.g. a PDF or a payment, in place of the tone's own icon. */
  icon?: ToastIcon;
  /** A quieter second line: the number, amount or name the message is about. */
  detail?: string;
  /** A follow-up the person is likely to want next, e.g. "Record payment" after issuing. */
  action?: ToastAction;
};

/** A settled message: the text alone, or the text with its detail and follow-up. */
export type ToastContent = string | ({ text: string } & Omit<ToastOptions, 'icon'>);

export type ToastPromiseMessages<T> = {
  loading: string;
  success: ToastContent | ((value: T) => ToastContent);
  error: string | ((err: unknown) => string);
  /** Shown once it has succeeded. */
  icon?: ToastIcon;
};

export type ToastApi = {
  show: (text: string, tone?: ToastTone, options?: ToastOptions) => void;
  /**
   * A "working…" toast that turns into the success or error message when the
   * task settles. Returns the task, so the caller still awaits it and handles
   * its failure; the toast only reports it.
   */
  promise: <T>(task: Promise<T>, messages: ToastPromiseMessages<T>) => Promise<T>;
};

export const settledText = <T>(message: string | ((value: T) => string), value: T) =>
  typeof message === 'function' ? message(value) : message;

export function settledContent<T>(message: ToastPromiseMessages<T>['success'], value: T): { text: string } & Omit<ToastOptions, 'icon'> {
  const content = typeof message === 'function' ? message(value) : message;
  return typeof content === 'string' ? { text: content } : content;
}
