import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Schema } from '@esmart/api-client';
import type { SyncQueueEntry } from '@esmart/core/types';
import { emptyData, useAppStore, type AppData } from '../store/appStore';
import { COLLECTIONS } from './collections';
import { api, isNetworkError } from './api';
import { RemoteError } from './errors';
import { useLogoQueue } from './logoQueue';
import { useRemoteMeta } from './meta';
import { useReceiptQueue } from './receiptQueue';
import { isOpen } from './outbox';
import { endSyncSession, loadSnapshot, reloadSnapshot, syncSoon } from './sync';
import { onTokensChange, setTokens } from './tokens';
import { LEGAL } from '../lib/legal';

type AuthSession = Schema<'AuthSession'>;

const device = () => ({ label: Platform.OS === 'web' ? 'Web browser' : `${Platform.OS} app`, platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim() });

/**
 * Starts a session from the API's AuthSession: stores the tokens, loads the
 * account's data into an empty store, then marks the session signed in, so
 * the first screen the router shows already has data.
 */
async function begin(auth: AuthSession, preferCompanyId?: string) {
  if (!auth.accessToken || !auth.refreshToken || !auth.user?.id) throw new RemoteError('incompleteSession', 'The server returned an incomplete session');
  await setTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
  useRemoteMeta.getState().reset();
  useAppStore.setState({ ...emptyData(), activeCompanyId: '', activeBranchId: '' });

  const { data: me } = await api.GET('/me');
  useAppStore.setState({
    accountId: me?.accountId ?? '',
    users: me?.user ? [me.user as never] : [],
    companies: (me?.companies ?? []) as never,
  });
  await loadSnapshot();

  const s = useAppStore.getState();
  const companyId = (preferCompanyId && s.companies.some((c) => c.id === preferCompanyId) ? preferCompanyId : undefined) ?? me?.defaultCompanyId ?? s.companies[0]?.id ?? '';
  const branches = s.branches.filter((b) => b.companyId === companyId);
  useAppStore.setState({
    activeCompanyId: companyId,
    activeBranchId: (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? '',
    session: { userId: auth.user.id, authenticated: true, onboardingComplete: !!(me?.onboardingComplete ?? auth.onboardingComplete), signedInAt: new Date().toISOString() },
  });
  await restoreUnsynced(auth.user.id);
}

export async function signIn(email: string, password: string) {
  const { data } = await api.POST('/auth/sign-in', { body: { email: email.trim(), password, device: device() } });
  await begin(data!);
}

export async function signUp(input: { name: string; email: string; phone?: string; phoneVerificationId?: string; password: string; locale?: string; termsVersion?: string }) {
  const { data } = await api.POST('/auth/sign-up', { body: { ...input, email: input.email.trim(), phone: input.phone || undefined } });
  await begin(data!);
}

/** Sends a code; returns the request id that verifyOtp needs. */
export async function requestOtp(phone: string): Promise<{ requestId: string; resendAfterSeconds: number }> {
  const { data } = await api.POST('/auth/otp/request', { body: { phone } });
  if (!data?.requestId) throw new RemoteError('incompleteSession', 'The server sent no OTP request id');
  return { requestId: data.requestId, resendAfterSeconds: data.resendAfterSeconds ?? 30 };
}

export async function verifyOtp(requestId: string, code: string) {
  const { data } = await api.POST('/auth/otp/verify', { body: { requestId, code, device: device() } });
  await begin(data!);
}

export async function forgotPassword(email: string) {
  await api.POST('/auth/password/forgot', { body: { email: email.trim() } });
}

/** Unsynced changes a user left behind on sign-out, kept per user (localStorage on the web). */
const unsyncedKey = (userId: string) => `ebs.unsynced.${userId}`;

/** Keeps the leaving user's unsynced changes on the device for their next sign-in. */
function stashUnsynced(): Promise<void> {
  const { session, syncQueue } = useAppStore.getState();
  const open = syncQueue.filter(isOpen);
  if (!session.userId || !open.length) return Promise.resolve();
  return AsyncStorage.setItem(unsyncedKey(session.userId), JSON.stringify(open)).catch(() => {});
}

/** Puts a returning user's unsynced changes back in the queue, pending and failed alike, and sends them. */
async function restoreUnsynced(userId: string) {
  try {
    const saved = await AsyncStorage.getItem(unsyncedKey(userId));
    if (!saved) return;
    const queue = useAppStore.getState().syncQueue;
    const back = (JSON.parse(saved) as SyncQueueEntry[]).filter((e) => !queue.some((q) => q.id === e.id));
    useAppStore.setState({ syncQueue: [...queue, ...back] });
    await AsyncStorage.removeItem(unsyncedKey(userId));
    syncSoon(0);
  } catch {
    // Unreadable storage: nothing to bring back.
  }
}

/** Forgets the session and everything loaded for it on this device, except unsynced changes. */
function clearLocal(): Promise<void> {
  // Read before the store empties; written after.
  const stashed = stashUnsynced();
  endSyncSession();
  useRemoteMeta.getState().reset();
  // A logo waiting to upload belongs to the account that left.
  useLogoQueue.getState().reset();
  useReceiptQueue.getState().reset();
  useAppStore.setState({
    ...emptyData(),
    activeCompanyId: '',
    activeBranchId: '',
    session: { userId: null, authenticated: false, onboardingComplete: false },
  });
  return stashed;
}

export async function signOut() {
  try {
    await api.POST('/auth/sign-out', {});
  } catch {
    // Signing out works offline too; the server session expires on its own.
  }
  await setTokens(null);
  await clearLocal();
}

/**
 * Deletes the account on the server, then forgets everything here. Unlike signing out, changes still
 * waiting to send are dropped rather than kept for a next sign-in that won't come. Throws (and
 * changes nothing locally) when the server refuses.
 */
export async function deleteAccount(body: Schema<'DeleteAccountRequest'>) {
  await api.POST('/me/delete', { body });
  const { userId } = useAppStore.getState().session;
  useAppStore.setState({ syncQueue: [] });
  if (userId) await AsyncStorage.removeItem(unsyncedKey(userId)).catch(() => {});
  await setTokens(null);
  await clearLocal();
}

/** A refresh the server refused (revoked device, reset password) signs out here too. */
export function watchSessionEnd(): () => void {
  return onTokensChange((t) => {
    if (!t && useAppStore.getState().session.authenticated) void clearLocal();
  });
}

/**
 * The rows a change still waits to send, collection by collection. The server
 * doesn't have them yet, so a reload that dropped them would empty the screen
 * (a business made offline, with everything in it).
 */
function unsentRows(): Partial<AppData> {
  const s = useAppStore.getState();
  const unsent = new Set(s.syncQueue.filter(isOpen).map((e) => e.entityId));
  const kept: Partial<AppData> = {};
  for (const { collection, key } of Object.values(COLLECTIONS)) {
    const rows = (s[collection] as unknown as Record<string, unknown>[]).filter((r) => unsent.has(String(r[key])));
    if (rows.length) (kept as Record<string, unknown>)[collection] = rows;
  }
  return kept;
}

/** Reloads everything from the server, keeping the session (Settings → Sync). */
export async function resync() {
  try {
    await reloadSnapshot(() => {
      const { accountId, session, activeCompanyId, activeBranchId, syncQueue } = useAppStore.getState();
      useAppStore.setState({ ...emptyData(), ...unsentRows(), accountId, syncQueue, session, activeCompanyId, activeBranchId });
    });
    // The active business or branch may have been a discarded change: open one that is still there.
    const s = useAppStore.getState();
    if (!s.companies.some((c) => c.id === s.activeCompanyId)) {
      const companyId = s.companies[0]?.id ?? '';
      const branches = s.branches.filter((b) => b.companyId === companyId);
      useAppStore.setState({ activeCompanyId: companyId, activeBranchId: (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? '' });
    } else if (!s.branches.some((b) => b.id === s.activeBranchId && b.companyId === s.activeCompanyId)) {
      const branches = s.branches.filter((b) => b.companyId === s.activeCompanyId);
      useAppStore.setState({ activeBranchId: (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? '' });
    }
  } catch (err) {
    useRemoteMeta.getState().patch(isNetworkError(err) ? { online: false } : { lastError: err instanceof Error ? err.message : String(err) });
  }
}

/** Sets a new password from an emailed reset link. Every session is signed out. */
export async function resetPassword(token: string, password: string) {
  await api.POST('/auth/password/reset', { body: { token, password } });
}

/** What an invitation link is for (business, inviter, role), before it is accepted. */
export async function getInvite(token: string) {
  const { data } = await api.GET('/invites/{token}', { params: { path: { token } } });
  return data as Schema<'InviteDetails'>;
}

/**
 * Accepts a team invitation and signs straight in. A new person sends the
 * password they chose; someone who already has an account sends none, and
 * lands in the business they just joined.
 */
export async function acceptInvite(token: string, password?: string, joinedCompanyId?: string) {
  // Accepting is agreeing to the terms the screen links to.
  const { data } = await api.POST('/invites/{token}/accept', { params: { path: { token } }, body: { ...(password ? { password } : {}), termsVersion: LEGAL.termsVersion } });
  await begin(data as AuthSession, joinedCompanyId);
}
