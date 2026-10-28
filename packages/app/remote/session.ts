import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Schema } from '@esmart/api-client';
import type { SyncQueueEntry } from '@esmart/core/types';
import { emptyData, useAppStore } from '../store/appStore';
import { api } from './api';
import { useLogoQueue } from './logoQueue';
import { useRemoteMeta } from './meta';
import { isOpen } from './outbox';
import { loadSnapshot, syncSoon } from './sync';
import { onTokensChange, setTokens } from './tokens';

type AuthSession = Schema<'AuthSession'>;

const device = () => ({ label: Platform.OS === 'web' ? 'Web browser' : `${Platform.OS} app`, platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim() });

/**
 * Starts a session from the API's AuthSession: stores the tokens, loads the
 * account's data into an empty store, then marks the session signed in, so
 * the first screen the router shows already has data.
 */
async function begin(auth: AuthSession, preferCompanyId?: string) {
  if (!auth.accessToken || !auth.refreshToken || !auth.user?.id) throw new Error('The server returned an incomplete session');
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

export async function signUp(input: { name: string; email: string; phone?: string; phoneVerificationId?: string; password: string; locale?: string }) {
  const { data } = await api.POST('/auth/sign-up', { body: { ...input, email: input.email.trim(), phone: input.phone || undefined } });
  await begin(data!);
}

/** Sends a code; returns the request id that verifyOtp needs. */
export async function requestOtp(phone: string): Promise<{ requestId: string; resendAfterSeconds: number }> {
  const { data } = await api.POST('/auth/otp/request', { body: { phone } });
  return { requestId: data?.requestId ?? '', resendAfterSeconds: data?.resendAfterSeconds ?? 30 };
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
  useRemoteMeta.getState().reset();
  // A logo waiting to upload belongs to the account that left.
  useLogoQueue.getState().reset();
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

/** A refresh the server refused (revoked device, reset password) signs out here too. */
export function watchSessionEnd(): () => void {
  return onTokensChange((t) => {
    if (!t && useAppStore.getState().session.authenticated) void clearLocal();
  });
}

/** Reloads everything from the server, keeping the session (Settings → Sync). */
export async function resync() {
  const { session, activeCompanyId, activeBranchId, syncQueue } = useAppStore.getState();
  useAppStore.setState({ ...emptyData(), syncQueue, session, activeCompanyId, activeBranchId });
  await loadSnapshot();
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
  const { data } = await api.POST('/invites/{token}/accept', { params: { path: { token } }, body: password ? { password } : {} });
  await begin(data as AuthSession, joinedCompanyId);
}
