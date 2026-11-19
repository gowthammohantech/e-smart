import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Enter in a one-line field of the form saves it, as a form on the web does, while the screen is
 * the one in view. A notes box keeps Enter for a new line, a dropdown's search keeps it to pick,
 * and a button or link that has the focus still does its own thing. Web only: a phone's keyboard
 * has its own return key on each field.
 */
export function useEnterToSave(onSave: () => void, enabled = true) {
  const latest = useRef({ onSave, enabled });
  useEffect(() => {
    latest.current = { onSave, enabled };
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        const el = e.target as HTMLElement | null;
        if (!el || el.tagName !== 'INPUT') return;
        // A dropdown's search box picks its highlighted option on Enter.
        if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete')) return;
        // A field inside a sheet or dialog over the form belongs to that, not to the form.
        if (el.closest('[role="dialog"], [aria-modal="true"]')) return;
        e.preventDefault();
        if (e.repeat) return;
        if (latest.current.enabled) latest.current.onSave();
      };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []),
  );
}
