import { PALETTES, type PaletteKey } from '@/lib/palette';

/**
 * Paints the invoice screen (the same content as mockups/Screens InvoiceScreen)
 * onto a 2D canvas, for use as the hero phone's screen texture. A texture
 * stays locked to the 3D glass at any angle, which CSS-3D overlays don't
 * reliably do.
 */

export const TEX_W = 280;
export const TEX_H = 594;
const SCALE = 3;

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawInvoiceScreen(canvas: HTMLCanvasElement, palette: PaletteKey, font: string) {
  const c = PALETTES[palette].css;
  canvas.width = TEX_W * SCALE;
  canvas.height = TEX_H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  // Rounded glass: corners stay transparent.
  roundRect(ctx, 0, 0, TEX_W, TEX_H, 28);
  ctx.clip();
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const text = (s: string, x: number, y: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'left') => {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  };
  const card = (x: number, y: number, w: number, h: number) => {
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = c.surface;
    ctx.fill();
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  const pill = (label: string, right: number, y: number, fg: string) => {
    ctx.font = `600 9px ${font}`;
    const w = ctx.measureText(label).width + 16;
    roundRect(ctx, right - w, y, w, 16, 8);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.globalAlpha = 1;
    text(label, right - w / 2, y + 11, 9, fg, 600, 'center');
  };

  // Status bar.
  text('9:41', 20, 22, 10, c.text, 600);
  roundRect(ctx, 108, 10, 64, 16, 8);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.fillStyle = c.text;
  ctx.fillRect(232, 14, 12, 8);
  ctx.strokeStyle = c.text;
  ctx.strokeRect(247, 14, 14, 8);

  // Header.
  text('Tax invoice', 16, 48, 10, c['text-muted']);
  text('INV/25-26/0148', 16, 67, 17, c.text, 500);
  ctx.beginPath();
  ctx.arc(250, 57, 14, 0, Math.PI * 2);
  ctx.fillStyle = c.primary;
  ctx.fill();
  text('SR', 250, 61, 11, '#fff', 600, 'center');

  // Billed to.
  card(16, 84, 248, 62);
  text('Billed to', 28, 102, 10, c['text-muted']);
  text('Sri Murugan Textiles', 28, 119, 12, c.text, 500);
  text('33AAKCS4821M1Z5 · Tamil Nadu', 28, 135, 9, c['text-dim']);
  pill('E-invoiced', 252, 94, c.good);

  // Lines.
  const lines = [
    ['Cotton yarn 40s', 'HSN 5205 · 120 kg', '₹28,800.00'],
    ['Polyester blend', 'HSN 5509 · 45 kg', '₹11,250.00'],
    ['Freight charges', 'HSN 9965 · 1', '₹1,850.00'],
  ];
  lines.forEach(([item, meta, amt], i) => {
    const y = 172 + i * 44;
    text(item, 16, y, 11, c.text, 500);
    text(meta, 16, y + 14, 9, c['text-dim']);
    text(amt, 264, y + 6, 11, c.text, 400, 'right');
    ctx.fillStyle = c.line;
    ctx.fillRect(16, y + 24, 248, 1);
  });

  // Totals.
  const totals = [
    ['Taxable value', '₹41,900.00'],
    ['CGST 6%', '₹2,514.00'],
    ['SGST 6%', '₹2,514.00'],
  ];
  totals.forEach(([k, v], i) => {
    const y = 316 + i * 17;
    text(k, 16, y, 10, c['text-muted']);
    text(v, 264, y, 10, c['text-muted'], 400, 'right');
  });
  ctx.fillStyle = c.line;
  ctx.fillRect(16, 360, 248, 1);
  text('Total', 16, 380, 13, c.text, 600);
  text('₹46,928.00', 264, 380, 13, c.text, 600, 'right');

  // IRN + QR.
  card(16, 396, 248, 88);
  ctx.fillStyle = '#fff';
  roundRect(ctx, 28, 408, 64, 64, 4);
  ctx.fill();
  drawQr(ctx, 31, 411, 58);
  text('IRN generated', 104, 424, 10, c.good, 600);
  text('a5c91f07e2…4be8d2', 104, 439, 9, c['text-dim']);
  text('Ack 1325 0047 8821 · 14 Oct', 104, 453, 9, c['text-muted']);
  text('Cancel window: 22h 41m', 104, 467, 9, c['text-muted']);

  // Actions.
  roundRect(ctx, 16, 540, 120, 34, 8);
  ctx.strokeStyle = c.line;
  ctx.stroke();
  text('Share PDF', 76, 561, 11, c.text, 500, 'center');
  roundRect(ctx, 144, 540, 120, 34, 8);
  ctx.fillStyle = c.primary;
  ctx.fill();
  text('E-way bill', 204, 561, 11, '#fff', 500, 'center');
}

/** The same decorative grid as mockups' FakeQr: not scannable. */
function drawQr(ctx: Ctx, x0: number, y0: number, size: number) {
  const n = 21;
  const cell = size / n;
  let s = 7;
  ctx.fillStyle = '#000';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      s = (s * 9301 + 49297) % 233280;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (!finder && s / 233280 > 0.52) ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
    }
  }
  for (const [fx, fy] of [
    [0, 0],
    [14, 0],
    [0, 14],
  ]) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x0 + fx * cell, y0 + fy * cell, cell * 7, cell * 7);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0 + (fx + 1) * cell, y0 + (fy + 1) * cell, cell * 5, cell * 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(x0 + (fx + 2) * cell, y0 + (fy + 2) * cell, cell * 3, cell * 3);
  }
}
