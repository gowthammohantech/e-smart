/**
 * Hides the browser's scrollbars everywhere in the web app. Scrolling itself
 * is untouched: wheel, trackpad, touch, keyboard and dragging all still work;
 * only the bar is not drawn. Injected once, in the browser only.
 */
if (typeof document !== 'undefined' && !document.getElementById('esmart-hide-scrollbars')) {
  const style = document.createElement('style');
  style.id = 'esmart-hide-scrollbars';
  style.textContent = `
    * { scrollbar-width: none; -ms-overflow-style: none; }
    *::-webkit-scrollbar { display: none; width: 0; height: 0; }
  `;
  document.head.appendChild(style);
}

export {};
