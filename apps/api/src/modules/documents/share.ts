import { and, desc, eq, gt, or, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { LanguageCode } from '@esmart/i18n/config';
import { schema } from '@esmart/db';
import type { Deps } from '../../context';
import { sha256 } from '../../lib/crypto';
import { esc } from '../payments/receipt';
import { effectiveStatus, today } from './lifecycle';
import { pdfFilename, renderDocumentHtml, renderDocumentPdf } from './outbound';

/** Statuses a customer never sees through a link: not issued yet, or withdrawn. */
const HIDDEN = new Set(['draft', 'cancelled', 'rejected']);

/**
 * Every share page answer: the token is in the URL, so nothing caches it, nothing sends it on as a
 * referrer, and no search engine lists it. The page has no scripts and can't be framed.
 */
function secure(reply: FastifyReply) {
  return reply
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .header('x-robots-tag', 'noindex, nofollow')
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
}

/** One page for every link that doesn't work, so it says nothing about which documents exist. */
const GONE = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Link not available</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;color:#1c1c1e;text-align:center}p{color:#6e6e73;line-height:1.5}</style></head>
<body><h1>This link isn’t available</h1><p>It may have expired, or the document may have been withdrawn. Ask the business that sent it for a new link.</p></body></html>`;

const gone = (reply: FastifyReply) => secure(reply).status(404).type('text/html; charset=utf-8').send(GONE);

/** The link's document, if a customer may see it now. */
async function resolve(deps: Deps, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const now = deps.now();
  const L = schema.shareLinks;
  const [hit] = await deps.db
    .select({ link: L, doc: schema.documents, company: schema.companies, suspendedAt: schema.accounts.suspendedAt })
    .from(L)
    .innerJoin(schema.documents, eq(schema.documents.id, L.documentId))
    .innerJoin(schema.companies, eq(schema.companies.id, L.companyId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(eq(L.tokenHash, sha256(token)), gt(L.expiresAt, now)));
  if (!hit || hit.suspendedAt || HIDDEN.has(effectiveStatus(hit.doc, today(now)))) return null;
  return { ...hit, now };
}

/**
 * The public pages behind `PUBLIC_BASE_URL/share/:token`, the links the app sends customers: the
 * document as printed, a PDF download and, for an invoice still owing, its payment link. Outside
 * the contract and the /v1 prefix, like /health.
 */
export function registerSharePages(app: FastifyInstance, deps: Deps) {
  const rateLimit = { max: 60, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => `share:${req.ip}` };

  app.get<{ Params: { token: string }; Querystring: { lang?: string } }>('/share/:token', { config: { rateLimit } }, async (req, reply) => {
    const found = await resolve(deps, req.params.token);
    if (!found) return gone(reply);
    const { link, doc, company, now } = found;
    const locale: LanguageCode = req.query.lang === 'ta' ? 'ta' : 'en';
    await deps.db.update(schema.shareLinks).set({ viewCount: sql`${schema.shareLinks.viewCount} + 1`, lastViewedAt: now }).where(eq(schema.shareLinks.id, link.id));

    const owing = doc.kind === 'invoice' && doc.amountPaidMinor < doc.grandTotalMinor && effectiveStatus(doc, today(now)) !== 'paid';
    const PL = schema.paymentLinks;
    const [pay] = owing
      ? await deps.db
          .select({ url: PL.url })
          .from(PL)
          .where(and(eq(PL.documentId, doc.id), eq(PL.status, 'active'), or(isNull(PL.expiresAt), gt(PL.expiresAt, now))))
          .orderBy(desc(PL.createdAt))
          .limit(1)
      : [];

    const html = await renderDocumentHtml(deps.db, deps, company, doc, { now, locale });
    const bar = `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin:0 0 16px;font-family:system-ui,-apple-system,sans-serif">
<a href="${esc(`${req.params.token}/pdf`)}" style="padding:8px 14px;border:1px solid #d1d1d6;border-radius:8px;color:#1c1c1e;text-decoration:none">Download PDF</a>
${pay ? `<a href="${esc(pay.url)}" rel="noopener noreferrer" style="padding:8px 14px;border-radius:8px;background:#0a7c4a;color:#fff;text-decoration:none;font-weight:600">Pay now</a>` : ''}
</div>`;
    const page = html
      .replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow"/>')
      .replace(/<body([^>]*)>/, `<body$1>\n${bar}`);
    return secure(reply).type('text/html; charset=utf-8').send(page);
  });

  app.get<{ Params: { token: string }; Querystring: { lang?: string } }>('/share/:token/pdf', { config: { rateLimit } }, async (req, reply) => {
    const found = await resolve(deps, req.params.token);
    if (!found) return gone(reply);
    const pdf = await renderDocumentPdf(deps.db, deps, found.company, found.doc, { now: found.now, locale: req.query.lang === 'ta' ? 'ta' : 'en' });
    return secure(reply).type('application/pdf').header('content-disposition', `inline; filename="${pdfFilename(found.doc.number)}"`).send(pdf);
  });
}
