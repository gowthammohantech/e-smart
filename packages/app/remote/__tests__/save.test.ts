import type { Party } from '@esmart/core/types';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useConnectivity } from '../connectivity';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { onUnconfirmed, saveOnline } from '../save';
import { refreshOnFocus } from '../sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../attachments', () => ({ uploadAttachment: jest.fn() }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const POST = api.POST as jest.Mock;
const GET = api.GET as jest.Mock;
type Sent = { id: string; method: string; path: string; body?: Record<string, unknown>; clientEntityId?: string };

installRemote();
const actions = () => useAppStore.getState();
const queue = () => outbox.entries();

const party = (over: Partial<Party> = {}) =>
  ({
    id: 'pty_new',
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

const answer = (fn: (m: Sent) => unknown) =>
  POST.mockImplementation(async (_p: string, { body }: { body: { mutations: Sent[] } }) => ({ data: { results: body.mutations.map(fn) } }));
const sentIds = () => POST.mock.calls.flatMap((c) => (c[1].body.mutations as Sent[]).map((m) => m.clientEntityId ?? m.path));

beforeEach(() => {
  POST.mockReset();
  GET.mockReset();
  GET.mockImplementation(async (path: string) => (path === '/sync/pull' ? { data: { changes: [], cursor: '1', hasMore: false } } : { data: { data: [], nextCursor: null } }));
  useRemoteMeta.getState().reset();
  const seed = buildTestBook();
  useAppStore.setState({ ...seed, syncQueue: [], activeCompanyId: BOOK.companyId, activeBranchId: BOOK.branchId, session: { userId: seed.users[0].id, authenticated: true, onboardingComplete: true } });
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions, online: true });
  useConnectivity.setState({ mode: 'online', promptOpen: false });
});

describe('saving while online', () => {
  it('waits for the server, takes its copy, and returns its id', async () => {
    answer((m) => ({ id: m.id, status: 'applied', entity: { ...m.body, id: 'pty_SERVER', code: 'C-007', version: 1 } }));
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res).toMatchObject({ outcome: 'saved', id: 'pty_SERVER' });
    expect(actions().parties.find((p) => p.id === 'pty_SERVER')?.code).toBe('C-007');
    expect(queue()).toHaveLength(0);
  });

  it('undoes a change the server refuses, and leaves nothing queued', async () => {
    const existing = actions().parties[0];
    answer((m) => ({ id: m.id, status: 'rejected', error: { detail: 'Name is taken' } }));
    const res = await saveOnline(() => actions().saveParty({ ...existing, name: 'Renamed' }));
    expect(res).toMatchObject({ outcome: 'refused', error: 'Name is taken' });
    expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe(existing.name);
    expect(queue()).toHaveLength(0);
  });

  it('removes a refused create', async () => {
    answer((m) => ({ id: m.id, status: 'rejected', error: { detail: 'No' } }));
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('refused');
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
  });

  it('undoes the side effects of a refused finalise too', async () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'draft')!;
    const series = actions().numberingSeries;
    answer((m) => ({ id: m.id, status: 'rejected', error: { detail: 'Not enough stock' } }));
    const res = await saveOnline(() => actions().setDocumentStatus(doc.id, 'issued'));
    expect(res.outcome).toBe('refused');
    expect(actions().documents.find((d) => d.id === doc.id)?.status).toBe('draft');
    expect(actions().numberingSeries).toEqual(series);
  });

  it('undoes the change when the connection stays down, without claiming it was not saved', async () => {
    POST.mockRejectedValue(new TypeError('Network request failed'));
    const res = await saveOnline(() => actions().saveParty(party()));
    // Sent, so the server may have it: "couldn't confirm", not "wasn't saved".
    expect(res.outcome).toBe('unconfirmed');
    // Asked again, under the same id each time, so the server can't save it twice.
    const ids = POST.mock.calls.map((c) => (c[1].body.mutations as Sent[])[0].id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(queue()).toHaveLength(0);
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
  });

  it('saves when asking again finds the server has it', async () => {
    let calls = 0;
    POST.mockImplementation(async (_p: string, { body }: { body: { mutations: Sent[] } }) => {
      if (++calls === 1) throw new TypeError('Network request failed');
      return { data: { results: body.mutations.map((m) => ({ id: m.id, status: 'applied', entity: { ...m.body, id: 'pty_SERVER', version: 1 } })) } };
    });
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res).toMatchObject({ outcome: 'saved', id: 'pty_SERVER' });
    expect(queue()).toHaveLength(0);
  });

  it('takes an answer that comes after the first wait, instead of undoing', async () => {
    // An answer that comes, but only after the save has stopped waiting.
    POST.mockImplementation(
      (_p: string, { body }: { body: { mutations: Sent[] } }) =>
        new Promise((r) => setTimeout(() => r({ data: { results: body.mutations.map((m) => ({ id: m.id, status: 'applied', entity: { ...m.body, id: 'pty_LATE', version: 1 } })) } }), 300)),
    );
    const res = await saveOnline(() => actions().saveParty(party()), { waitMs: 50 });
    expect(res).toMatchObject({ outcome: 'saved', id: 'pty_LATE' });
    expect(queue()).toHaveLength(0);
    expect(actions().parties.some((p) => p.id === 'pty_LATE')).toBe(true);
  });

  it('undoes a change made outside a save that the server never confirms, and says so', async () => {
    POST.mockRejectedValue(new TypeError('Network request failed'));
    const told = jest.fn();
    onUnconfirmed.add(told);
    try {
      const existing = actions().parties[0];
      actions().saveParty({ ...existing, name: 'Renamed' });
      expect(actions().parties[0].name).toBe('Renamed');
      await new Promise((r) => setTimeout(r, 3_000));
      expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe(existing.name);
      expect(queue()).toHaveLength(0);
      expect(told).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unconfirmed' }));
    } finally {
      onUnconfirmed.delete(told);
    }
  }, 10_000);

  it('sends a new save behind changes already queued', async () => {
    // Kept from offline mode, still to go when the next save does.
    useConnectivity.setState({ mode: 'offline' });
    actions().saveParty(party({ id: 'pty_old', name: 'Old' }));
    useConnectivity.setState({ mode: 'online' });
    answer((m) => ({ id: m.id, status: 'applied', entity: { ...m.body, id: `srv_${m.clientEntityId}`, version: 1 } }));
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('saved');
    expect(sentIds()).toEqual(['pty_old', 'pty_new']);
  });
});

describe('saving in offline mode', () => {
  it('saves on the device without waiting, once the person has agreed to it', async () => {
    useRemoteMeta.setState({ online: false });
    useConnectivity.setState({ mode: 'offline' });
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('queued');
    expect(POST).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(1);
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(true);
  });
});

describe('saving while view-only', () => {
  beforeEach(() => {
    useRemoteMeta.setState({ online: false });
    useConnectivity.setState({ mode: 'readonly' });
  });

  it('does not run the action, and asks whether to work offline', async () => {
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('unreachable');
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
    expect(queue()).toHaveLength(0);
    expect(useConnectivity.getState().promptOpen).toBe(true);
  });

  it('blocks a store action called directly too, but not marking notifications read', () => {
    actions().saveParty(party());
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
    expect(queue()).toHaveLength(0);
    expect(() => actions().markAllNotificationsRead()).not.toThrow();
  });
});

describe('opening a screen', () => {
  it('pulls from the server when online, at most every 3 seconds', async () => {
    jest.useFakeTimers();
    try {
      refreshOnFocus();
      await jest.advanceTimersByTimeAsync(10);
      const pulls = () => GET.mock.calls.filter(([p]) => p === '/sync/pull').length;
      expect(pulls()).toBe(1);
      refreshOnFocus();
      await jest.advanceTimersByTimeAsync(10);
      expect(pulls()).toBe(1);
      await jest.advanceTimersByTimeAsync(3_000);
      refreshOnFocus();
      await jest.advanceTimersByTimeAsync(10);
      expect(pulls()).toBe(2);

      useRemoteMeta.setState({ online: false });
      await jest.advanceTimersByTimeAsync(3_000);
      refreshOnFocus();
      await jest.advanceTimersByTimeAsync(10);
      expect(pulls()).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
