import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Ctrl+S (⌘+S on a Mac) does what the screen's Save button does, while the
 * screen is the one in view. `enabled` mirrors the button: false while it is
 * disabled or saving. The browser's own "save page" never opens over a form.
 * A phone has no keyboard for it, so this only listens on the web.
 * `onSaveAnother`, when given, is Shift+Ctrl+S: a new record's "Save & add another".
 */
export function useSaveShortcut(onSave: () => void, enabled = true, onSaveAnother?: () => void) {
  const latest = useRef({ onSave, enabled, onSaveAnother });
  useEffect(() => {
    latest.current = { onSave, enabled, onSaveAnother };
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      const onKey = (e: KeyboardEvent) => {
        // Browser autofill fires keydown events with no `key`.
        if (e.key?.toLowerCase() !== 's' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
        const another = e.shiftKey ? latest.current.onSaveAnother : undefined;
        if (e.shiftKey && !another) return;
        e.preventDefault();
        // Held down, the key repeats: one save per press.
        if (e.repeat) return;
        if (latest.current.enabled) (another ?? latest.current.onSave)();
      };
      // Capturing, so it still works from inside a text field.
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []),
  );
}
