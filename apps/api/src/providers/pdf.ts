import type { Config } from '../config';

/** Renders the same HTML templates the app prints (documentHtml) to PDF. */
export interface PdfProvider {
  render(html: string, opts?: { format?: 'A4' | 'Letter' }): Promise<Buffer>;
}

/**
 * A minimal, valid one-page PDF carrying the document's text. Used in tests
 * and anywhere Chromium isn't installed, so PDF endpoints still answer.
 */
export class StubPdf implements PdfProvider {
  async render(html: string): Promise<Buffer> {
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500)
      .replace(/[\\()]/g, '\\$&')
      .replace(/[^\x20-\x7e]/g, '?');
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += 90) lines.push(text.slice(i, i + 90));
    const stream = `BT /F1 10 Tf 40 800 Td 12 TL ${lines.map((l) => `(${l}) '`).join(' ')} ET`;
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(body.length);
      body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = body.length;
    body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(body, 'latin1');
  }
}

/** CSS pixels (96 dpi) of each sheet, and how much taller than a sheet a document may be and still stay on one page. */
const PAGE_PX = { A4: { width: 794, height: 1123 }, Letter: { width: 816, height: 1056 } } as const;
const MAX_ONE_PAGE_STRETCH = 1.5;

/** Headless Chromium through playwright-core. One browser, reused. */
export class ChromiumPdf implements PdfProvider {
  private browser: Promise<import('playwright-core').Browser> | null = null;
  constructor(private readonly config: Config) {}

  private launch() {
    this.browser ??= import('playwright-core').then(({ chromium }) =>
      chromium.launch({ executablePath: this.config.CHROMIUM_PATH, args: ['--no-sandbox'] }),
    );
    return this.browser;
  }

  async render(html: string, opts: { format?: 'A4' | 'Letter' } = {}): Promise<Buffer> {
    const browser = await this.launch();
    const page = await browser.newPage();
    try {
      const format = opts.format ?? 'A4';
      const size = PAGE_PX[format];
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.setContent(html, { waitUntil: 'load' });
      // The preview in the app is one continuous page, so an invoice only a
      // little taller than the sheet stays on one page (a single taller page)
      // instead of spilling its terms and signature onto a second sheet. A
      // genuinely long document still paginates normally.
      const contentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      const oneSheet = contentHeight > size.height && contentHeight <= size.height * MAX_ONE_PAGE_STRETCH;
      // No page margins: the document template carries its own body padding, so
      // margins here would double up and push a one-page invoice onto a second page.
      const margin = { top: '0', bottom: '0', left: '0', right: '0' };
      return oneSheet
        ? await page.pdf({ width: `${size.width}px`, height: `${contentHeight + 1}px`, printBackground: true, margin })
        : await page.pdf({ format, printBackground: true, margin });
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) await (await this.browser).close();
  }
}
