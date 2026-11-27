/**
 * Hides the browser's scrollbars everywhere in the web app. Scrolling itself
 * is untouched: wheel, trackpad, touch, keyboard and dragging all still work;
 * only the bar is not drawn. Injected once, in the browser only. The import
 * sample sheet keeps a thin bar, because it is wider than the page.
 */
if (typeof document !== 'undefined' && !document.getElementById('esmart-hide-scrollbars')) {
  const style = document.createElement('style');
  style.id = 'esmart-hide-scrollbars';
  style.textContent = `
    * { scrollbar-width: none; -ms-overflow-style: none; }
    *::-webkit-scrollbar { display: none; width: 0; height: 0; }
    #import-sample-sheet { scrollbar-width: thin; }
    #import-sample-sheet::-webkit-scrollbar { display: block; height: 8px; }
    #import-sample-sheet::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.5); border-radius: 4px; }
  `;
  document.head.appendChild(style);
}

export {};
