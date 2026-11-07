import type { Party } from '@esmart/core/types';
import { ApiError } from '@esmart/api-client';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useConnectivity } from '../connectivity';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { saveOnline } from '../save';
import { drainLeftovers } from '../send';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

type Init = { body?: Record<string, unknown>; headers?: Record<string, string> };
const POST = api.POST as jest.Mock;
const PUT = api.PUT as jest.Mock;
const PATCH = api.PATCH as jest.Mock;
const GET = api.GET as jest.Mock;

installRemote();
const actions = () => useAppStore.getState();
const queue = () => outbox.entries();

const party = (over: Partial<Party> = {}) =>
  ({
    id: 'pty_local',
    companyId: BOOK.companyId,
    kind: 'customer',
    name: 'New Traders',
    code: 'C-900',
    currency: 'INR',
    billingAddress: { line1: '1 Road', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' },
    openingBalance: { minor: 0, currency: 'INR' },
    paymentTermsDays: 30,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  }) as Party;

/** Every write goes through; each answers with its body, a version and whatever `over` adds. */
function accept(over: (path: string, body: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  const ok = async (path: string, { body }: Init) => ({ data: { ...body, version: 2, ...over(path, body ?? {}) } });
  for (const m of [POST, PUT, PATCH]) m.mockImplementation(ok);
}

beforeEach(() => {
  for (const m of [POST, PUT, PATCH, GET]) m.mockReset();
  GET.mockImplementation(async () => ({ data: { data: [], nextCursor: null } }));
  useRemoteMeta.getState().reset();
  const seed = buildTestBook();
  useAppStore.setState({ ...seed, syncQueue: [], activeCompanyId: BOOK.companyId, activeBranchId: BOOK.branchId, session: { userId: seed.users[0].id, authenticated: true, onboardingComplete: true } });
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions, online: true });
  useConnectivity.setState({ mode: 'online', promptOpen: false });
});

describe('sending a save straight to the server', () => {
  it('swaps the id the server gave a create into what follows it in the same save', async () => {
    const doc = actions().documents[0];
    accept((path) => (path.endsWith('/parties') ? { id: 'pty_SERVER' } : {}));
    const res = await saveOnline(() => {
      actions().saveParty(party());
      actions().updateDocument(doc.id, { partyId: 'pty_local' });
      return 'pty_local';
    });
    expect(res).toMatchObject({ outcome: 'saved', id: 'pty_SERVER' });
    // The edit went to the server already naming the server's party.
    const edit = [...PUT.mock.calls, ...PATCH.mock.calls].find((c) => String(c[0]).includes(doc.id))!;
    expect((edit[1] as Init).body).toMatchObject({ partyId: 'pty_SERVER' });
    expect(actions().parties.some((p) => p.id === 'pty_local')).toBe(false);
    expect(actions().documents.find((d) => d.id === doc.id)?.partyId).toBe('pty_SERVER');
    expect(useRemoteMeta.getState().versions.pty_SERVER).toBe(2);
    expect(queue()).toHaveLength(0);
  });

  it("points what follows a new company at the server's defaults", async () => {
    const lists: Record<string, unknown[]> = {
      '/companies/{companyId}/tax-categories': [{ id: 'tax_SERVER', companyId: 'cmp_SERVER', rate: 18, version: 1 }],
    };
    GET.mockImplementation(async (path: string) => ({ data: { data: lists[path] ?? [], nextCursor: null } }));
    accept((path) => (path === '/companies' ? { id: 'cmp_SERVER' } : {}));
    let localTax = '';
    const res = await saveOnline(() => {
      const companyId = actions().createCompany({ ...actions().companies[0], name: 'New Co' } as never);
      localTax = actions().taxCategories.find((x) => x.companyId === companyId && x.rate === 18)!.id;
      actions().saveItem({ ...actions().items[0], id: 'itm_new', companyId, taxCategoryId: localTax } as never);
      return companyId;
    });
    expect(res.outcome).toBe('saved');
    const item = POST.mock.calls.find((c) => String(c[0]).endsWith('/items'))!;
    expect(item[0]).toContain('cmp_SERVER');
    expect((item[1] as Init).body).toMatchObject({ taxCategoryId: 'tax_SERVER' });
    expect(actions().taxCategories.some((x) => x.id === localTax)).toBe(false);
  });

  it('creates a company whose plan keeps a defaults list closed', async () => {
    GET.mockImplementation(async (path: string) => {
      if (path === '/companies/{companyId}/expense-categories') throw new ApiError(403, { status: 403, title: 'Forbidden', detail: 'Needs pro' });
      return { data: { data: [], nextCursor: null } };
    });
    accept(() => ({ id: 'cmp_FREE' }));
    const res = await saveOnline(() => actions().createCompany({ ...actions().companies[0], name: 'Free Co' } as never));
    expect(res).toMatchObject({ outcome: 'saved', id: 'cmp_FREE' });
    expect(queue()).toHaveLength(0);
  });

  it('stops at the first refusal: what was built on it is not sent', async () => {
    const doc = actions().documents[0];
    POST.mockImplementation(async () => {
      throw new ApiError(422, { status: 422, title: 'Refused', detail: 'Name is taken' });
    });
    const res = await saveOnline(() => {
      actions().saveParty(party());
      actions().updateDocument(doc.id, { partyId: 'pty_local' });
      return 'pty_local';
    });
    expect(res).toMatchObject({ outcome: 'refused', error: 'Name is taken' });
    expect(PUT).not.toHaveBeenCalled();
    expect(PATCH).not.toHaveBeenCalled();
    expect(actions().documents.find((d) => d.id === doc.id)?.partyId).toBe(doc.partyId);
    expect(queue()).toHaveLength(0);
  });
});

describe('changes an older build left on the device', () => {
  it('sends them once, in order, and drops one the server refuses', async () => {
    const existing = actions().parties[0];
    useAppStore.setState({
      syncQueue: [
        { id: '11111111-1111-4111-8111-111111111111', label: 'A', entityType: 'party', entityId: existing.id, action: 'update', status: 'pending', attempts: 0, queuedAt: '2026-11-01T00:00:00Z', method: 'PUT', path: `/companies/${BOOK.companyId}/parties/${existing.id}`, body: { ...existing, name: 'Kept' }, baseVersion: 1 },
        { id: '22222222-2222-4222-8222-222222222222', label: 'B', entityType: 'party', entityId: 'pty_old', action: 'create', status: 'pending', attempts: 0, queuedAt: '2026-11-01T00:00:01Z', method: 'POST', path: `/companies/${BOOK.companyId}/parties`, body: party({ id: 'pty_old' }), clientEntityId: 'pty_old' },
      ] as never,
    });
    accept();
    POST.mockImplementation(async () => {
      throw new ApiError(422, { status: 422, title: 'Refused', detail: 'No' });
    });
    await drainLeftovers();
    expect(PUT).toHaveBeenCalledWith(expect.stringContaining(existing.id), expect.objectContaining({ headers: { 'If-Match': '"v1"' } }));
    expect(POST).toHaveBeenCalledWith(`/companies/${BOOK.companyId}/parties`, expect.objectContaining({ headers: { 'Idempotency-Key': '22222222-2222-4222-8222-222222222222' } }));
    expect(queue()).toHaveLength(0);
  });

  it('keeps them when the server cannot be reached, to try again', async () => {
    const existing = actions().parties[0];
    useAppStore.setState({
      syncQueue: [
        { id: '33333333-3333-4333-8333-333333333333', label: 'A', entityType: 'party', entityId: existing.id, action: 'update', status: 'pending', attempts: 0, queuedAt: '2026-11-01T00:00:00Z', method: 'PUT', path: `/companies/${BOOK.companyId}/parties/${existing.id}`, body: { ...existing, name: 'Kept' }, baseVersion: 1 },
      ] as never,
    });
    PUT.mockRejectedValue(new TypeError('Network request failed'));
    await drainLeftovers();
    expect(queue()).toHaveLength(1);
  });
});
