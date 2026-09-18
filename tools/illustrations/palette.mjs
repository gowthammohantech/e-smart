/**
 * Placeholder-art palette.
 *
 * These illustrations sit on both the dark (#1D2331) and light (#FFFFFF) card
 * surfaces, so every value is chosen to read against both. Keep the list short
 * — the GIF encoder quantises to these exact colours.
 */
export const P = {
  blob: '#0A5FC4',      // background blob, drawn at low opacity
  blobSoft: '#2C7DE0',
  line: '#8E98AC',      // outlines — the app's muted token
  lineSoft: '#B5BFD0',
  accent: '#007AFF',    // brand
  accentSoft: '#7FB6FF',
  paper: '#E8EEF7',     // "paper" fills, light enough for dark, dark enough for light
  paperEdge: '#C7D4E6',
  good: '#34C88A',
  warn: '#F0B429',
  bad: '#FF6B6B',
  skin: '#F2C6A0',
  hair: '#3A4256',
};

/** Colours the GIF encoder may emit, in index order. Index 0 is transparent. */
export const GIF_PALETTE = [
  '#000000', // 0 — transparent slot
  P.blob, P.blobSoft, P.line, P.lineSoft, P.accent, P.accentSoft,
  P.paper, P.paperEdge, P.good, P.warn, P.bad, P.skin, P.hair,
  '#FFFFFF', '#5A6478',
];
