import type { Party } from '@esmart/core/types';
import { PRIMARY_COMPANY_ID } from '@esmart/core/data/seed';
import { buildSeedData, useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { syncNow } from '../sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ isRemote: () => true, DATA_SOURCE: 'remote', API_BASE_URL: 'http://api.test/v1' }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const POST = api.POST as jest.Mock;
const GET = api.GET as jest.Mock;

installRemote();
const actions = () => useAppStore.getState();
const queue = () => outbox.entries();

function party(over: Partial<Party> = {}): Party {
  return {
    id: 'pty_offline1',
    companyId: PRIMARY_COMPANY_ID,
    kind: 'customer',
    name: 'Offline Traders',
    code: 'C-900',
    currency: 'INR',
    billingAddress: { line1: '1 Road', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' },
    openingBalance: { minor: 0, currency: 'INR' },
    paymentTermsDays: 30,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  } as Party;
}

/** A pull that brings nothing, and empty owned lists. */
function quietServer() {
  GET.mockImplementation(async (path: string) => {
    if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
    return { data: { data: [], nextCursor: null } };
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  POST.mockReset();
  GET.mockReset();
  quietServer();
  useRemoteMeta.getState().reset();
  const seed = buildSeedData();
  useAppStore.setState({
    ...seed,
    syncQueue: [],
    activeCompanyId: PRIMARY_COMPANY_ID,
    activeBranchId: 'brn_mum',
    session: { userId: seed.users[0].id, authenticated: true, onboardingComplete: true },
  });
  // Everything in the seed counts as already on the server, at version 1.
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions });
});

afterEach(() => jest.useRealTimers());

describe('queueing', () => {
  it('creates offline entities with their own id, and folds later edits into that create', () => {
    actions().saveParty(party());
    actions().saveParty(party({ name: 'Offline Traders LLP' }));
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ method: 'POST', path: `/companies/${PRIMARY_COMPANY_ID}/parties`, clientEntityId: 'pty_offline1', status: 'pending' });
    expect((queue()[0].body as Party).name).toBe('Offline Traders LLP');
  });

  it('updates what the server knows with a PUT against its version', () => {
    const existing = actions().parties[0];
    actions().saveParty({ ...existing, name: 'Renamed' });
    actions().saveParty({ ...existing, name: 'Renamed again' });
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ method: 'PUT', path: `/companies/${PRIMARY_COMPANY_ID}/parties/${existing.id}`, baseVersion: 1 });
    expect((queue()[0].body as Party).name).toBe('Renamed again');
  });

  it('forgets an offline create that is deleted before it syncs', () => {
    actions().saveParty(party());
    actions().removeParty('pty_offline1');
    expect(queue()).toHaveLength(0);
  });

  it('never sends derived statuses, and queues one request for a nested action', () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'issued')!;
    actions().setDocumentStatus(doc.id, 'paid');
    expect(queue()).toHaveLength(0);

    const copyId = actions().duplicateDocument(doc.id);
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ method: 'POST', path: `/companies/${PRIMARY_COMPANY_ID}/documents/${doc.id}/duplicate`, clientEntityId: copyId });
  });

  it('sends a new company with the numbering chosen during onboarding', () => {
    const companyId = actions().createCompany({ ...actions().companies[0], name: 'New Co' } as never);
    const series = actions().numberingSeries.find((s) => s.companyId === companyId && s.kind === 'invoice')!;
    actions().saveNumberingSeries({ ...series, prefix: 'NC', nextNumber: 101 });
    expect(queue()).toHaveLength(1);
    expect(queue()[0].body).toMatchObject({ name: 'New Co', seedDefaults: true, numberingSeries: [{ kind: 'invoice', prefix: 'NC', nextNumber: 101 }] });
  });
});

describe('syncing', () => {
  it('swaps offline ids for server ids everywhere once the create syncs', async () => {
    actions().saveParty(party());
    const doc = actions().documents[0];
    actions().updateDocument(doc.id, { partyId: 'pty_offline1' });
    const [create, patch] = queue();
    expect(patch.body).toMatchObject({ partyId: 'pty_offline1' });

    POST.mockResolvedValueOnce({
      data: {
        results: [
          { id: create.id, status: 'applied', entity: { ...party(), id: 'pty_SERVER', version: 1 } },
          { id: patch.id, status: 'applied', entity: { ...actions().documents[0], partyId: 'pty_SERVER', version: 2 } },
        ],
      },
    });
    await syncNow();

    expect(actions().parties.some((p) => p.id === 'pty_offline1')).toBe(false);
    expect(actions().parties.find((p) => p.id === 'pty_SERVER')?.name).toBe('Offline Traders');
    expect(actions().documents.find((d) => d.id === doc.id)?.partyId).toBe('pty_SERVER');
    expect(useRemoteMeta.getState().versions.pty_SERVER).toBe(1);
    expect(queue()).toHaveLength(0);
  });

  it('keeps a conflicting change for the user and shows the server copy', async () => {
    const existing = actions().parties[0];
    actions().saveParty({ ...existing, name: 'Mine' });
    const [entry] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: entry.id, status: 'conflict', entity: { ...existing, name: 'Theirs', version: 3 } }] } });
    await syncNow();

    expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe('Theirs');
    expect(queue()[0]).toMatchObject({ status: 'failed', conflict: expect.objectContaining({ name: 'Theirs' }) });

    // Retrying sends the change again against the server's new version.
    actions().retrySync(entry.id);
    expect(queue()[0].status).toBe('pending');
  });

  it('holds changes while offline and sends them in order when back', async () => {
    POST.mockRejectedValue(new TypeError('Network request failed'));
    actions().saveParty(party({ id: 'pty_a', name: 'A' }));
    actions().saveParty(party({ id: 'pty_b', name: 'B' }));
    await syncNow();
    expect(useRemoteMeta.getState().online).toBe(false);
    expect(queue().map((e) => e.status)).toEqual(['pending', 'pending']);
    // The UI kept working: both are in the store already.
    expect(actions().parties.filter((p) => ['pty_a', 'pty_b'].includes(p.id))).toHaveLength(2);

    POST.mockReset();
    POST.mockImplementation(async (_path: string, { body }: { body: { mutations: { id: string; clientEntityId: string }[] } }) => ({
      data: { results: body.mutations.map((m) => ({ id: m.id, status: 'applied', entity: { id: m.clientEntityId.replace('pty_', 'srv_'), version: 1 } })) },
    }));
    await syncNow();
    const sent = POST.mock.calls[0][1].body.mutations.map((m: { clientEntityId: string }) => m.clientEntityId);
    expect(sent).toEqual(['pty_a', 'pty_b']);
    expect(useRemoteMeta.getState().online).toBe(true);
    expect(queue()).toHaveLength(0);
  });

  it('applies what the server changed since the last pull', async () => {
    const doc = actions().documents[0];
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [{ entityType: 'document', entityId: doc.id, op: 'upsert', version: 7, data: { ...doc, number: 'INV/26-27/0099', version: 7 } }], cursor: '42', hasMore: false } };
      return { data: { data: [], nextCursor: null } };
    });
    await syncNow();
    expect(actions().documents.find((d) => d.id === doc.id)?.number).toBe('INV/26-27/0099');
    expect(useRemoteMeta.getState().cursor).toBe('42');
  });
});

