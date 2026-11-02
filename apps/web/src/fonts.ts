import { WEB_FONT_FAMILY } from '@esmart/ui/theme/webTokens';

/**
 * Loads Inter for the whole web app. The variable font is self-hosted from
 * public/fonts, so it loads offline and from the same origin as the app; one
 * file per subset carries every weight from 100 to 900. Latin-ext is there for
 * the rupee sign (U+20B9) and accented names. Injected once, in the browser only.
 */
if (typeof document !== 'undefined' && !document.getElementById('esmart-fonts')) {
  const face = (file: string, range: string) => `
    @font-face {
      font-family: 'InterWeb';
      font-style: normal;
      font-display: swap;
      font-weight: 100 900;
      src: url(/fonts/${file}) format('woff2-variations'), url(/fonts/${file}) format('woff2');
      unicode-range: ${range};
    }`;
  const style = document.createElement('style');
  style.id = 'esmart-fonts';
  style.textContent = `
    ${face('inter-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF')}
    ${face('inter-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD')}
    html, body { font-family: ${WEB_FONT_FAMILY}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
    /* react-native-web gives every input its own system font class; inputs
       should read in the same face as the labels above them. */
    input, textarea, select, button { font-family: ${WEB_FONT_FAMILY} !important; }
    ::selection { background: rgba(10,108,240,0.22); }
  `;
  document.head.appendChild(style);
}

export {};
