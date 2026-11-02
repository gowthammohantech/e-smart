import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Ctrl+S (⌘+S on a Mac) does what the screen's Save button does, while the
 * screen is the one in view. `enabled` mirrors the button: false while it is
 * disabled or saving. The browser's own "save page" never opens over a form.
 * A phone has no keyboard for it, so this only listens on the web.
 */
export function useSaveShortcut(onSave: () => void, enabled = true) {
  const latest = useRef({ onSave, enabled });
  useEffect(() => {
    latest.current = { onSave, enabled };
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      const onKey = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() !== 's' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        e.preventDefault();
        if (latest.current.enabled) latest.current.onSave();
      };
      // Capturing, so it still works from inside a text field.
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []),
  );
}
