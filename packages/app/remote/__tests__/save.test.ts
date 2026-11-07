import type { Party } from '@esmart/core/types';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useConnectivity } from '../connectivity';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ApiError } from '@esmart/api-client';
import { onUnconfirmed, saveOnline, useSaveOnline } from '../save';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../attachments', () => ({ uploadAttachment: jest.fn() }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const POST = api.POST as jest.Mock;
const PUT = api.PUT as jest.Mock;
const GET = api.GET as jest.Mock;
type Init = { body?: Record<string, unknown>; headers?: Record<string, string> };

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

/** The server takes every create and update, answering with its own copy. */
const accept = (over: (path: string, body: Record<string, unknown>) => Record<string, unknown> = () => ({})) => {
  const ok = async (path: string, { body }: Init) => ({ data: { ...body, version: 2, ...over(path, body ?? {}) } });
  POST.mockImplementation(ok);
  PUT.mockImplementation(ok);
};
const refuse = (status: number, detail: string, code?: string) => {
  const err = async () => {
    throw new ApiError(status, { status, title: 'Refused', detail, code });
  };
  POST.mockImplementation(err);
  PUT.mockImplementation(err);
};
const sentNames = () => POST.mock.calls.map((c) => (c[1] as Init).body?.name);

beforeEach(() => {
  POST.mockReset();
  GET.mockReset();
  PUT.mockReset();
  GET.mockImplementation(async () => ({ data: { data: [], nextCursor: null } }));
  useRemoteMeta.getState().reset();
  const seed = buildTestBook();
  useAppStore.setState({ ...seed, syncQueue: [], activeCompanyId: BOOK.companyId, activeBranchId: BOOK.branchId, session: { userId: seed.users[0].id, authenticated: true, onboardingComplete: true } });
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions, online: true });
  useConnectivity.setState({ mode: 'online', promptOpen: false });
});

describe('saving', () => {
  it("posts straight to the route, takes the server's copy, and returns its id", async () => {
    accept(() => ({ id: 'pty_SERVER', code: 'C-007' }));
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res).toMatchObject({ outcome: 'saved', id: 'pty_SERVER' });
    expect(POST).toHaveBeenCalledWith(`/companies/${BOOK.companyId}/parties`, expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }) }));
    expect(actions().parties.find((p) => p.id === 'pty_SERVER')?.code).toBe('C-007');
    expect(queue()).toHaveLength(0);
  });

  it('sends an edit as a PUT against the version it was made on', async () => {
    accept();
    const existing = actions().parties[0];
    const res = await saveOnline(() => actions().saveParty({ ...existing, name: 'Renamed' }));
    expect(res.outcome).toBe('saved');
    expect(PUT).toHaveBeenCalledWith(`/companies/${BOOK.companyId}/parties/${existing.id}`, expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"v1"' }) }));
    expect(useRemoteMeta.getState().versions[existing.id]).toBe(2);
  });

  it('undoes a change the server refuses, and leaves nothing queued', async () => {
    const existing = actions().parties[0];
    refuse(422, 'Name is taken', 'VALIDATION_FAILED');
    const res = await saveOnline(() => actions().saveParty({ ...existing, name: 'Renamed' }));
    expect(res).toMatchObject({ outcome: 'refused', error: 'Name is taken', errorCode: 'VALIDATION_FAILED' });
    expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe(existing.name);
    expect(queue()).toHaveLength(0);
  });

  it('removes a refused create', async () => {
    refuse(422, 'No');
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('refused');
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
  });

  it('undoes the side effects of a refused finalise too', async () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'draft')!;
    const series = actions().numberingSeries;
    refuse(422, 'Not enough stock');
    const res = await saveOnline(() => actions().setDocumentStatus(doc.id, 'issued'));
    expect(res.outcome).toBe('refused');
    expect(actions().documents.find((d) => d.id === doc.id)?.status).toBe('draft');
    expect(actions().numberingSeries).toEqual(series);
  });

  it("on a stale version, shows the server's copy and says it changed elsewhere", async () => {
    const existing = actions().parties[0];
    refuse(412, 'Changed elsewhere', 'VERSION_MISMATCH');
    GET.mockImplementation(async () => ({ data: { ...existing, name: 'Theirs', version: 5 } }));
    const res = await saveOnline(() => actions().saveParty({ ...existing, name: 'Mine' }));
    expect(res).toMatchObject({ outcome: 'refused', errorCode: 'VERSION_MISMATCH' });
    expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe('Theirs');
  });

  it('undoes the change when the server cannot be reached, and keeps nothing', async () => {
    POST.mockRejectedValue(new TypeError('Network request failed'));
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('unreachable');
    expect(queue()).toHaveLength(0);
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
  });

  it('undoes a change made outside a save that cannot reach the server, and says so', async () => {
    PUT.mockRejectedValue(new TypeError('Network request failed'));
    const told = jest.fn();
    onUnconfirmed.add(told);
    try {
      const existing = actions().parties[0];
      actions().saveParty({ ...existing, name: 'Renamed' });
      expect(actions().parties[0].name).toBe('Renamed');
      await new Promise((r) => setTimeout(r, 20));
      expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe(existing.name);
      expect(queue()).toHaveLength(0);
      expect(told).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unreachable' }));
    } finally {
      onUnconfirmed.delete(told);
    }
  });
});

describe('with no connection', () => {
  beforeEach(() => {
    useRemoteMeta.setState({ online: false });
    useConnectivity.setState({ mode: 'readonly' });
  });

  it('does not run the action or send anything', async () => {
    const res = await saveOnline(() => actions().saveParty(party()));
    expect(res.outcome).toBe('unreachable');
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
    expect(POST).not.toHaveBeenCalled();
  });

  it('blocks a store action called directly too, but not marking notifications read', () => {
    actions().saveParty(party());
    expect(actions().parties.some((p) => p.id === 'pty_new')).toBe(false);
    expect(queue()).toHaveLength(0);
    expect(() => actions().markAllNotificationsRead()).not.toThrow();
  });
});

describe('a double tap on a screen', () => {
  /** The hook as a screen holds it. */
  function mountSave() {
    const ref: { current: ReturnType<typeof useSaveOnline> | null } = { current: null };
    function Probe() {
      ref.current = useSaveOnline();
      return null;
    }
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(React.createElement(Probe));
    });
    return { hook: () => ref.current!, unmount: () => act(() => root.unmount()) };
  }

  it('saves once: a second save while the first is out does nothing', async () => {
    accept((_p, body) => ({ id: `srv_${String(body.name)}` }));
    const screen = mountSave();
    let first: unknown;
    let second: unknown;
    await act(async () => {
      // Both before any re-render, the way two quick taps land.
      const a = screen.hook().save(() => actions().saveParty(party({ id: 'pty_a' })));
      const b = screen.hook().save(() => actions().saveParty(party({ id: 'pty_b' })));
      [first, second] = await Promise.all([a, b]);
    });
    expect(first).toMatchObject({ outcome: 'saved' });
    expect(second).toBeNull();
    expect(sentNames()).toHaveLength(1);
    screen.unmount();
  });

  it('with hold, stays shut after a save that went through, until released', async () => {
    accept((_p, body) => ({ id: `srv_${String(body.name)}` }));
    const screen = mountSave();
    await act(async () => {
      await screen.hook().save(() => actions().saveParty(party({ id: 'pty_a' })), { hold: true });
    });
    let again: unknown;
    await act(async () => {
      again = await screen.hook().save(() => actions().saveParty(party({ id: 'pty_b' })));
    });
    expect(again).toBeNull();
    expect(screen.hook().saving).toBe(true);
    act(() => screen.hook().release());
    await act(async () => {
      again = await screen.hook().save(() => actions().saveParty(party({ id: 'pty_b' })));
    });
    expect(again).toMatchObject({ outcome: 'saved' });
    screen.unmount();
  });
});
