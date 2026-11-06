jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));

// The first test loads the whole store from cold, which takes seconds on a busy CI runner.
jest.setTimeout(30_000);

// Fetched after each module reset: the store must share this instance.
let AsyncStorage: { getItem: jest.Mock; setItem: jest.Mock; clear: () => Promise<void> };

const KEY = 'ebs.remote.v1';
const saved = JSON.stringify({ state: { accountId: 'acc_saved', syncQueue: [{ id: 'q1', label: 'Kept', status: 'pending' }] }, version: 5 });
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
};
const writesOfTheBook = () => AsyncStorage.setItem.mock.calls.filter(([k]) => k === KEY).map(([, v]) => JSON.parse(v as string).state);

function loadApp() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAppStore } = require('../../store/appStore');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { installRemote } = require('../install');
  installRemote();
  return useAppStore;
}

beforeEach(async () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  AsyncStorage.setItem.mockClear();
  AsyncStorage.getItem.mockClear();
});

describe('launching', () => {
  it('A8: never writes an empty book over the saved one', async () => {
    await AsyncStorage.setItem(KEY, saved);
    AsyncStorage.setItem.mockClear();

    const store = loadApp();
    expect(writesOfTheBook()).toHaveLength(0);
    await flush();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().accountId).toBe('acc_saved');
    expect(store.getState().syncQueue).toHaveLength(1);
    for (const state of writesOfTheBook()) expect(state.syncQueue).toHaveLength(1);
    // The wrapped actions survive hydration.
    expect(typeof store.getState().saveParty).toBe('function');
  });

  it('A8: reports hydrated when nothing was saved yet', async () => {
    const store = loadApp();
    await flush();
    expect(store.getState().hydrated).toBe(true);
  });

  it('A8: a read that fails twice carries on without saving over the disk', async () => {
    await AsyncStorage.setItem(KEY, saved);
    AsyncStorage.setItem.mockClear();
    // By key: the other persisted stores read through the same mock.
    let reads = 0;
    AsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key !== KEY) return null;
      reads += 1;
      throw new Error('disk');
    });

    const store = loadApp();
    await flush();

    expect(store.getState().hydrated).toBe(true);
    store.setState({ accountId: 'acc_after' });
    await flush();
    expect(writesOfTheBook()).toHaveLength(0);
    expect(reads).toBe(2);
  });

  it('a re-read for another tab\'s change does not save this tab\'s copy back', async () => {
    await AsyncStorage.setItem(KEY, saved);
    const store = loadApp();
    await flush();
    AsyncStorage.setItem.mockClear();
    await store.persist.rehydrate();
    await flush();
    expect(writesOfTheBook()).toHaveLength(0);
  });
});
