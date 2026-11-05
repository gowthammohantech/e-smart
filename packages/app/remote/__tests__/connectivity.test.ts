import { useAppStore } from '../../store/appStore';
import { acceptOffline, declineOffline, PROMPT_AFTER_MS, STABLE_FOR_MS, startConnectivity, stopConnectivity, useConnectivity } from '../connectivity';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mode = () => useConnectivity.getState().mode;
const prompt = () => useConnectivity.getState().promptOpen;
const online = (on: boolean) => useRemoteMeta.getState().patch({ online: on });
const queueOne = () => outbox.push({ method: 'POST', path: '/companies/c/parties', body: {}, entityType: 'party', entityId: 'pty_x', label: 'X', clientEntityId: 'pty_x' });
const send = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  send.mockReset();
  // A drain that sends everything it's given.
  send.mockImplementation(async () => useAppStore.setState({ syncQueue: [] }));
  useAppStore.setState({ syncQueue: [] });
  useRemoteMeta.setState({ online: true });
  startConnectivity({ drain: send });
});

afterEach(() => {
  stopConnectivity();
  jest.useRealTimers();
});

describe('losing the connection', () => {
  it('goes view-only at once, and asks only after 10 seconds', () => {
    online(false);
    expect(mode()).toBe('readonly');
    jest.advanceTimersByTime(PROMPT_AFTER_MS - 1);
    expect(prompt()).toBe(false);
    jest.advanceTimersByTime(1);
    expect(prompt()).toBe(true);
  });

  it('goes back online without asking when the connection returns in time', () => {
    online(false);
    jest.advanceTimersByTime(PROMPT_AFTER_MS / 2);
    online(true);
    expect(mode()).toBe('online');
    jest.advanceTimersByTime(PROMPT_AFTER_MS);
    expect(prompt()).toBe(false);
  });

  it('works offline when accepted, and stays view-only when declined', () => {
    online(false);
    jest.advanceTimersByTime(PROMPT_AFTER_MS);
    declineOffline();
    expect(mode()).toBe('readonly');
    expect(prompt()).toBe(false);
    acceptOffline();
    expect(mode()).toBe('offline');
  });
});

describe('coming back after working offline', () => {
  beforeEach(() => {
    online(false);
    jest.advanceTimersByTime(PROMPT_AFTER_MS);
    acceptOffline();
    queueOne();
  });

  it('sends the outbox once the connection has held for 15 seconds, then goes online', async () => {
    online(true);
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS - 1);
    expect(send).not.toHaveBeenCalled();
    expect(mode()).toBe('offline');
    await jest.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(mode()).toBe('online');
  });

  it('starts counting again when the connection flaps', async () => {
    online(true);
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS - 1_000);
    online(false);
    online(true);
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS - 1_000);
    expect(send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stays draining until nothing is left to send', async () => {
    send.mockImplementation(async () => undefined);
    online(true);
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS);
    expect(mode()).toBe('draining');
    useAppStore.setState({ syncQueue: [] });
    expect(mode()).toBe('online');
  });

  it('goes online once only changes the server asked to have sent again are left', async () => {
    // The server answered "retry": the entry stays pending, tried once, and goes out with the next sync.
    send.mockImplementation(async () => {
      const [e] = outbox.entries();
      outbox.update(e.id, { attempts: 1 });
    });
    online(true);
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS);
    expect(outbox.entries()).toHaveLength(1);
    expect(mode()).toBe('online');
  });

  it('falls back to offline, without asking again, if the connection drops while sending', async () => {
    send.mockImplementation(async () => undefined);
    online(true);
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS);
    online(false);
    expect(mode()).toBe('offline');
    jest.advanceTimersByTime(PROMPT_AFTER_MS);
    expect(prompt()).toBe(false);
  });
});

describe('at launch', () => {
  it('starts offline when an earlier run left changes to send, and sends them under the same rule', async () => {
    stopConnectivity();
    queueOne();
    startConnectivity({ drain: send });
    expect(mode()).toBe('offline');
    await jest.advanceTimersByTimeAsync(STABLE_FOR_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(mode()).toBe('online');
  });

  it('starts view-only without a connection', () => {
    stopConnectivity();
    useRemoteMeta.setState({ online: false });
    startConnectivity({ drain: send });
    expect(mode()).toBe('readonly');
  });
});
