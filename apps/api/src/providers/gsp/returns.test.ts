import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config';
import { ReturnsError } from '../returns';
import { AdaequareReturns, parseGstr2b } from './returns';
import { GspRequestError, type GspRequest, type GspTransport } from './transport';

const config = () => loadConfig({ TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test/test/', TAXATION_ADAEQUARE_APP_ID: 'app', TAXATION_ADAEQUARE_APP_SECRET: 'secret' });

/** Records each request and answers from a queue. */
function fake(answers: (unknown | Error)[]) {
  const calls: { method: string; request: GspRequest }[] = [];
  const transport: GspTransport = {
    authenticate: async () => ({ accessToken: 'bearer', expiresInSeconds: 3600 }),
    get: async (request) => {
      calls.push({ method: 'get', request });
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { success: true, result: next } as never;
    },
    post: async (request) => {
      calls.push({ method: 'post', request });
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { success: true, result: next } as never;
    },
  };
  return { transport, calls };
}

const session = { authToken: 'tok', expiresAt: new Date('2026-10-01T12:00:00Z'), refreshableUntil: new Date('2026-10-30T00:00:00Z') };
const ctx = { gstin: '27AABCV1234F1ZO', username: 'vertex', session };

describe('GSTR-2B as GSTN publishes it', () => {
  it('flattens invoices, notes, amendments and imports into entries in paise', () => {
    const r = parseGstr2b({
      data: {
        gendt: '14-10-2026',
        docdata: {
          b2b: [{ ctin: '29AACFA9876P1ZH', trdnm: 'Anand Steel', supfildt: '11-10-2026', inv: [{ inum: 'AS/101', dt: '05-09-2026', val: 11800, pos: '27', rev: 'N', itcavl: 'Y', items: [{ txval: 10000, igst: 1800, cgst: 0, sgst: 0, cess: 0 }] }] }],
          b2ba: [{ ctin: '29AACFA9876P1ZH', inv: [{ inum: 'AS/099', oinum: 'AS/98', dt: '30-08-2026', rev: 'N', itcavl: 'N', rsn: 'P', txval: 500, igst: 90 }] }],
          cdnr: [{ ctin: '27AAACB1111C1ZZ', nt: [{ ntnum: 'CN-7', typ: 'C', dt: '20-09-2026', rev: 'Y', itcavl: 'Y', items: [{ txval: 1000, cgst: 90, sgst: 90 }] }] }],
          impg: [{ portcode: 'INNSA1', boenum: '1234567', boedt: '02-09-2026', txval: 50000, igst: 9000, cess: 0 }],
        },
      },
    });
    expect(r.status).toBe('generated');
    if (r.status !== 'generated') return;
    expect(r.generatedAt).toBe('2026-10-14');
    expect(r.entries).toEqual([
      expect.objectContaining({ section: 'b2b', supplierGstin: '29AACFA9876P1ZH', number: 'AS/101', date: '2026-09-05', taxableMinor: 1_000_000, igstMinor: 180_000, itcAvailable: true, supplierFiledOn: '2026-10-11' }),
      expect.objectContaining({ section: 'b2ba', number: 'AS/099', originalNumber: 'AS/98', taxableMinor: 50_000, itcAvailable: false, itcReason: 'P' }),
      expect.objectContaining({ section: 'cdnr', documentType: 'C', reverseCharge: true, cgstMinor: 9_000, sgstMinor: 9_000 }),
      expect.objectContaining({ section: 'impg', documentType: 'BOE', number: '1234567', igstMinor: 900_000 }),
    ]);
  });

  it('reads an empty answer as not generated', () => {
    expect(parseGstr2b({ data: {} })).toEqual({ status: 'notGenerated' });
  });
});

describe('Adaequare returns', () => {
  it('opens a session with the OTP and sends the taxpayer headers on every call', async () => {
    const { transport, calls } = fake([{}, { auth_token: 'AT1', expiry: 360 }, { reference_id: 'REF1' }]);
    const gsp = new AdaequareReturns(config(), transport, () => Date.parse('2026-10-01T06:00:00Z'));
    await gsp.requestOtp(ctx.gstin, 'vertex');
    const s = await gsp.authenticate(ctx.gstin, 'vertex', '123456');
    expect(s.authToken).toBe('AT1');
    expect(s.expiresAt.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(calls[1].request.body).toEqual({ action: 'AUTHTOKEN', username: 'vertex', otp: '123456' });

    const saved = await gsp.save({ ...ctx, session: s }, 'gstr1', '092026', { b2b: [] });
    expect(saved.referenceId).toBe('REF1');
    expect(calls[2].request.path).toBe('/enriched/gsp/taxpayerapi/v3.0/returns/gstr1');
    expect(calls[2].request.headers).toMatchObject({ gstin: ctx.gstin, 'state-cd': '27', username: 'vertex', 'auth-token': 'AT1', ret_period: '092026' });
    expect(calls[2].request.token).toBe('bearer');
  });

  it('reads a lost answer as unanswered and an AUTH code as an ended session', async () => {
    const lost = new GspRequestError('timeout', 'transport', undefined);
    const auth = new GspRequestError('AUTH4033: invalid session', 'envelope', 422);
    const refused = new GspRequestError('RET191175: return already filed', 'envelope', 422);
    const { transport } = fake([lost, auth, refused]);
    const gsp = new AdaequareReturns(config(), transport);
    await expect(gsp.save(ctx, 'gstr3b', '092026', {})).rejects.toMatchObject({ code: 'UNANSWERED' });
    await expect(gsp.save(ctx, 'gstr3b', '092026', {})).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    const e = await gsp.save(ctx, 'gstr3b', '092026', {}).catch((x) => x);
    expect(e).toBeInstanceOf(ReturnsError);
    expect(e).toMatchObject({ code: 'PORTAL_REFUSED', portalCodes: ['RET191175'] });
  });

  it('maps the portal tracker to returns, keeping GSTR-1 and 3B', async () => {
    const { transport } = fake([{ EFiledlist: [{ rtntype: 'GSTR1', ret_prd: '082026', status: 'Filed', arn: 'AA270826000001', dof: '11-09-2026' }, { rtntype: 'GSTR9', ret_prd: '032026', status: 'Filed' }] }]);
    const gsp = new AdaequareReturns(config(), transport);
    expect(await gsp.trackReturns(ctx, '2026-27')).toEqual([{ returnType: 'gstr1', period: '082026', status: 'filed', arn: 'AA270826000001', filedOn: '2026-09-11' }]);
  });
});
