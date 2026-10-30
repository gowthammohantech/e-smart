import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Toaster, sileo, type SileoOptions } from 'sileo';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { TOAST_ANCHOR_ID, settledContent, settledText, type ToastApi, type ToastIcon, type ToastOptions, type ToastTone } from './toastTypes';

export type { ToastApi, ToastContent, ToastIcon, ToastOptions, ToastTone } from './toastTypes';
export { TOAST_ANCHOR_ID } from './toastTypes';

/**
 * The browser's toast, built on Sileo: a pill that names the outcome, then
 * opens out to the message, the number or amount it was about, and a
 * follow-up button when there is an obvious next step. Same API as
 * Toast.tsx, so screens don't know which one they got.
 *
 * Sileo keeps one list for the whole page, so only the outermost provider
 * draws it; a sheet's own provider (Sheet `ownToasts`) just passes through,
 * since these toasts already sit above every sheet.
 */

// Sileo is styled for a page with Tailwind's reset, which this one doesn't
// have. Without border-box its padded text runs 2rem past the pill; its toast
// is a <button>, which brings the browser's own small, centred button font;
// and its action is an <a>. Above react-native-web's Modal (z-index 9999), so
// a toast about an open sheet is not hidden behind it. A white pill on a light
// page needs a shadow to lift it off; --esmart-toast-shadow follows the theme.
if (typeof document !== 'undefined' && !document.getElementById('esmart-sileo')) {
  const style = document.createElement('style');
  style.id = 'esmart-sileo';
  style.textContent = `
    [data-sileo-viewport][data-position^='top'] { padding-top: 0; }
    [data-sileo-viewport][data-position$='right'] { padding-right: 0; }
    [data-sileo-viewport] { z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    [data-sileo-viewport], [data-sileo-viewport] *, [data-sileo-viewport] *::before, [data-sileo-viewport] *::after { box-sizing: border-box; }
    [data-sileo-toast] { font: inherit; color: inherit; text-align: left; -webkit-tap-highlight-color: transparent; }
    [data-sileo-canvas] { filter: var(--esmart-toast-shadow); }
    [data-sileo-title] { text-transform: none; font-weight: 600; }
    [data-sileo-description] { min-height: 50px; display: flex; flex-direction: column; justify-content: center; padding: 14px 16px; line-height: 1.4; }
    [data-sileo-viewport][data-theme="light"] [data-sileo-description] { color: rgba(255, 255, 255, 0.82); }
    [data-sileo-viewport][data-theme="dark"] [data-sileo-description] { color: rgba(20, 26, 36, 0.78); }
    [data-sileo-button] { width: 100%; height: 2.25rem; margin-top: 12px; padding: 0 12px; font-size: 0.8125rem; font-weight: 600; text-decoration: none; white-space: nowrap; }
  `;
  document.head.appendChild(style);
}

// Every toast lands on the profile avatar at the top bar's right end (TopBar.tsx),
// hiding it while it is up: the 40px pill's middle on the 60px bar's, and its
// round end centred on the 34px avatar (16px in from the edge), which puts the
// pill 4px further out than the avatar. Sileo's own padding on those sides is
// taken off above.
const TOAST_TOP = 10;
const TOAST_RIGHT = 12;
// In a phone's browser the pill drops in at the top centre, like a phone's own
// status island, level with the page's header row: the tab pages' header
// (AppHeader, marked with TOAST_ANCHOR_ID) is measured as the toast appears;
// any other page has the 64px stack header, whose middle is 32px down. The
// 40px pill starts 20px above the middle it centres on.
const PILL_HALF = 20;
const PHONE_TOP = 'var(--esmart-toast-top, calc(env(safe-area-inset-top, 0px) + 12px))';

/** Lines the phone-browser pill up with the header row on screen, if it is one we can see. */
function levelWithHeader() {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(`[id="${TOAST_ANCHOR_ID}"]`));
  // Earlier screens stay in the page, hidden or covered; only the one on top counts.
  const shown = rows.find((el) => {
    const r = el.getBoundingClientRect();
    if (!r.height) return false;
    const hit = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  const root = document.documentElement.style;
  if (!shown) {
    root.removeProperty('--esmart-toast-top');
    return;
  }
  const r = shown.getBoundingClientRect();
  root.setProperty('--esmart-toast-top', `${Math.max(0, r.top + r.height / 2 - PILL_HALF)}px`);
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const outer = useContext(ToastContext);
  if (outer) return <>{children}</>;
  return <PageToaster>{children}</PageToaster>;
}

// About as much as the 350px pill shows on one line beside its icon.
const PILL_CHARS = 34;

/** The message when the pill couldn't hold it, then its detail: quieter, and in even-width figures so amounts line up. */
function Description({ text, detail }: { text?: string; detail?: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {text ? <span>{text}</span> : null}
      {detail ? (
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2, opacity: 0.72, fontVariantNumeric: 'tabular-nums' }}>{detail}</span>
      ) : null}
    </span>
  );
}

function PageToaster({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const desktop = useIsDesktop();
  // Sileo's state colours become the app's own, so a success toast is the
  // same green as a paid badge.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--sileo-state-success', t.c.good);
    root.setProperty('--sileo-state-error', t.c.bad);
    root.setProperty('--sileo-state-warning', t.c.warn);
    root.setProperty('--sileo-state-info', t.c.primary);
    root.setProperty('--sileo-state-action', t.c.primary);
    root.setProperty('--sileo-state-loading', t.c.muted);
    root.setProperty(
      '--esmart-toast-shadow',
      t.scheme === 'dark'
        ? 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.5))'
        : 'drop-shadow(0 8px 22px rgba(20, 26, 36, 0.14)) drop-shadow(0 1px 3px rgba(20, 26, 36, 0.1))',
    );
  }, [t]);

  // The pill is the theme's own card: white on the light theme, and on the dark
  // one a shade lighter than the page so it doesn't sink into the top bar.
  const options = useMemo<Partial<SileoOptions>>(() => ({ fill: t.c.card, roundness: 18 }), [t.c.card]);
  // Sileo names its theme after the text it puts on the pill, the opposite of
  // the page's: its "dark" is dark text for a light pill.
  const sileoTheme = t.scheme === 'dark' ? 'light' : 'dark';

  const api = useMemo<ToastApi>(() => {
    const titles: Record<ToastTone, string> = {
      success: tr('common:toast.success'),
      error: tr('common:toast.error'),
      warning: tr('common:toast.warning'),
      info: tr('common:toast.info'),
    };
    const colors: Record<ToastTone, string> = { success: t.c.good, error: t.c.bad, warning: t.c.warn, info: t.c.primary };
    const glyph = (icon: ToastIcon | undefined, color: string) =>
      icon ? <MaterialCommunityIcons name={icon} size={15} color={color} /> : undefined;
    // The message itself is the pill ("Welcome back", "PDF downloaded"), opening
    // out only for its detail or button. One too long for the pill gets a heading
    // for its kind instead, with the whole message beneath.
    const body = (text: string, tone: ToastTone, options?: ToastOptions): SileoOptions => {
      const fits = text.length <= PILL_CHARS;
      return {
        title: fits ? text : titles[tone],
        description: fits && !options?.detail ? undefined : <Description text={fits ? undefined : text} detail={options?.detail} />,
        icon: glyph(options?.icon, options?.action ? t.c.primary : colors[tone]),
      };
    };
    const withAction = (opts: SileoOptions, action: NonNullable<ToastOptions['action']>) => {
      const id = sileo.action({
        ...opts,
        button: {
          title: action.label,
          onClick: () => {
            sileo.dismiss(id);
            action.onPress();
          },
        },
      });
    };
    return {
      show: (text, tone = 'info', options) => {
        if (!desktop) levelWithHeader();
        if (options?.action) withAction(body(text, tone, options), options.action);
        else sileo[tone](body(text, tone, options));
      },
      promise: (task, messages) => {
        if (!desktop) levelWithHeader();
        // The returned promise is the task itself; Sileo handles its own copy of the rejection.
        void sileo.promise(task, {
          loading: { title: messages.loading },
          success: (value) => {
            const { text, ...rest } = settledContent(messages.success, value);
            return body(text, 'success', { icon: messages.icon, ...rest });
          },
          error: (err) => body(settledText(messages.error, err), 'error'),
        });
        // A follow-up can't ride on Sileo's promise toast, so it replaces it once settled.
        task.then(
          (value) => {
            const { text, action, ...rest } = settledContent(messages.success, value);
            if (action) withAction(body(text, 'success', { icon: messages.icon, ...rest, action }), action);
          },
          () => {},
        );
        return task;
      },
    };
  }, [tr, t, desktop]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <Toaster
              position={desktop ? 'top-right' : 'top-center'}
              offset={desktop ? { top: TOAST_TOP, right: TOAST_RIGHT } : { top: PHONE_TOP }}
              theme={sileoTheme}
              options={options}
            />,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

// Outside a provider a toast goes nowhere, as in Toast.tsx.
const silent: ToastApi = { show: () => {}, promise: (task) => task };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? silent;
}
