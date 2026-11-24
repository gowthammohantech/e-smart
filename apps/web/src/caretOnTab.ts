/**
 * Tab into a filled field and the browser selects all its text, which hides the caret; on the dark
 * theme the faint selection barely shows either, so the field looks focused with no cursor in it.
 * A field reached by Tab gets its caret at the end of the text instead. A click is left alone, so
 * the caret still lands where clicked. Injected once, in the browser only.
 */
if (typeof document !== 'undefined' && !(window as { __caretOnTab?: boolean }).__caretOnTab) {
  (window as { __caretOnTab?: boolean }).__caretOnTab = true;
  // Text-like inputs only: number, email and the like don't support moving the caret.
  const TEXT_TYPES = ['text', 'search', 'tel', 'url', 'password', ''];
  let byTab = false;
  document.addEventListener('keydown', (e) => (byTab = e.key === 'Tab'), true);
  document.addEventListener('pointerdown', () => (byTab = false), true);
  document.addEventListener(
    'focusin',
    (e) => {
      const field = e.target;
      if (!byTab) return;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      if (field instanceof HTMLInputElement && !TEXT_TYPES.includes(field.type)) return;
      if (field.readOnly) return;
      // After the browser's own select-all on focus.
      requestAnimationFrame(() => {
        if (document.activeElement !== field) return;
        const end = field.value.length;
        try {
          field.setSelectionRange(end, end);
        } catch {
          // A type that has no caret to move.
        }
      });
    },
    true,
  );
}

export {};
