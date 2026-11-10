import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ApiError, type Schema } from '@esmart/api-client';
import { create } from 'zustand';
import { emptyData, useAppStore } from '../store/appStore';
import { takeLegacyBook } from '../store/legacyBook';
import { applyChanges } from './apply';
import { api, isNetworkError } from './api';
import { RemoteError } from './errors';
import { useRemoteMeta } from './meta';
import { endRefreshSession, loadCompany, refreshNow, refreshSoon } from './refresh';
import { getTokens, onTokensChange, setTokens } from './tokens';
import * as analytics from '../lib/analytics';
import { LEGAL } from '../lib/legal';
import { unregisterPush } from './push';
import { MfaCancelled, useMfaGate } from '../features/security/mfaGateStore';

type AuthSession = Schema<'AuthSession'>;

const device = () => ({ label: Platform.OS === 'web' ? 'Web browser' : `${Platform.OS} app`, platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim() });

/** The business and branch last open, per person, so the app opens where it was left. */
const ACTIVE_KEY = 'ebs.active.v1';
type Active = { userId: string; companyId: string; branchId: string };

async function lastActive(userId: string): Promise<Active | undefined> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(ACTIVE_KEY)) ?? 'null') as Active | null;
    return saved?.userId === userId ? saved : undefined;
  } catch {
    return undefined;
  }
}

let rememberingActive = false;
/** Writes down which business and branch are open whenever that changes. A preference, not data. */
export function rememberActive() {
  if (rememberingActive) return;
  rememberingActive = true;
  let last = '';
  useAppStore.subscribe((s) => {
    const userId = s.session.userId;
    if (!userId || !s.activeCompanyId) return;
    analytics.setCompany(s.activeCompanyId);
    const now = JSON.stringify({ userId, companyId: s.activeCompanyId, branchId: s.activeBranchId });
    if (now === last) return;
    last = now;
    void AsyncStorage.setItem(ACTIVE_KEY, now).catch(() => {});
  });
}

/**
 * Opens a session for whoever the tokens belong to: reads who they are and their businesses, opens
 * one (the one asked for, else the one last open, else their default) and loads its setup. Throws
 * when the server can't be reached; a refused session has already signed out by then.
 */
async function open(userId: string, opts: { preferCompanyId?: string; preferBranchId?: string; onboardingComplete?: boolean } = {}) {
  useRemoteMeta.getState().reset();
  const me = await readMe();
  analytics.identify({ id: userId, demo: me?.demo, shareUsageData: me?.shareUsageData });
  const companies = me?.companies ?? [];
  const has = (id: string | undefined) => !!id && companies.some((c) => c.id === id);
  const saved = await lastActive(userId);
  const companyId = [opts.preferCompanyId, saved?.companyId, me?.defaultCompanyId ?? undefined, companies[0]?.id].find(has) ?? '';
  useAppStore.setState({ ...emptyData(), activeCompanyId: '', activeBranchId: '', accountId: me?.accountId ?? '', users: me?.user ? [me.user as never] : [] });
  applyChanges(companies.filter((c) => c.id).map((c) => ({ entityType: 'company', entityId: c.id!, op: 'upsert', data: c })));
  // The first screen needs the business's setup (its branch, tax rates, numbering): waited for.
  if (companyId) await loadCompany(companyId).catch((err: unknown) => {
    if (isNetworkError(err)) throw err;
  });
  const branches = useAppStore.getState().branches.filter((b) => b.companyId === companyId);
  const branchId = [opts.preferBranchId, saved?.companyId === companyId ? saved.branchId : undefined].find((id) => branches.some((b) => b.id === id)) ?? (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? '';
  useAppStore.setState({
    activeCompanyId: companyId,
    activeBranchId: branchId,
    session: { userId, authenticated: true, onboardingComplete: !!(me?.onboardingComplete ?? opts.onboardingComplete), signedInAt: new Date().toISOString(), ...(me?.demo && { demo: true }) },
  });
  refreshSoon(0);
}

/** Starts a session from the API's AuthSession: stores the tokens, then opens it. */
async function begin(auth: AuthSession, preferCompanyId?: string) {
  if (!auth.accessToken || !auth.refreshToken || !auth.user?.id) throw new RemoteError('incompleteSession', 'The server returned an incomplete session');
  await setTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
  await open(auth.user.id, { preferCompanyId, onboardingComplete: auth.onboardingComplete });
}

/** How opening the app went: still loading, done, or stopped because the server couldn't be reached. */
/** `busy`: the server answered but couldn't serve us yet (rate limit, a deploy's 5xx) — not the device's connection. */
export const useStartup = create<{ state: 'loading' | 'ready' | 'offline' | 'busy' }>(() => ({ state: 'loading' }));

/**
 * At launch: the device keeps only the session's tokens, so a signed-in person's books load from the
 * server before the first screen. The first launch after the update also sends what an
 * offline-first build left unsent, then forgets its copy of the book.
 */
export function startUp(): Promise<void> {
  // One at a time: a second call while one runs (the layout loads twice on the web) joins it.
  starting ??= start().finally(() => {
    starting = null;
  });
  return starting;
}
let starting: Promise<void> | null = null;

async function start(): Promise<void> {
  useStartup.setState({ state: 'loading' });
  const legacy = await takeLegacyBookOnce();
  try {
    const tokens = await getTokens();
    if (!tokens) {
      useAppStore.setState({ hydrated: true });
      useStartup.setState({ state: 'ready' });
      legacyRead = null;
      return;
    }
    // Through readMe: a session held for its authenticator code asks for it rather than signing out.
    const who = await readMe();
    const userId = who?.user?.id;
    if (!userId) throw new RemoteError('incompleteSession', 'The server returned no user');
    await open(userId, legacy?.userId === userId ? { preferCompanyId: legacy.activeCompanyId, preferBranchId: legacy.activeBranchId } : {});
    if (legacy?.userId === userId && legacy.syncQueue.length) {
      useAppStore.setState({ syncQueue: legacy.syncQueue });
      void refreshNow();
    }
    useAppStore.setState({ hydrated: true });
    useStartup.setState({ state: 'ready' });
    // Taken and removed: nothing is left to read on a later start.
    legacyRead = null;
  } catch (err) {
    if (isNetworkError(err) || !sessionEnded(err)) {
      // Unreachable, or the server is having trouble (a deploy's 502, a 429, a 426 that raises the
      // update gate): the session is still good, so keep it and let them try again.
      const busy = err instanceof ApiError && (err.status === 429 || err.status >= 500);
      useStartup.setState({ state: busy ? 'busy' : 'offline' });
      return;
    }
    // The server ended the session (the tokens are gone by now) or answered nonsense: sign in again.
    await setTokens(null).catch(() => {});
    clearLocal();
    useAppStore.setState({ hydrated: true });
    useStartup.setState({ state: 'ready' });
  }
}

/**
 * Whether a failed launch means the session is over: the server refused it (401, or a 403 such as a
 * suspended account), the authenticator prompt was given up, or it answered without a user. Any
 * other failure leaves the tokens alone.
 */
export function sessionEnded(err: unknown): boolean {
  if (err instanceof MfaCancelled) return true;
  if (err instanceof RemoteError) return err.code === 'incompleteSession';
  if (err instanceof ApiError) return err.status === 401 || (err.status === 403 && err.code !== 'MFA_REQUIRED');
  return false;
}

/** Read once per launch, even if the first start-up has to be retried. */
let legacyRead: ReturnType<typeof takeLegacyBook> | null = null;
const takeLegacyBookOnce = () => (legacyRead ??= takeLegacyBook());

/**
 * Who signed in. With an authenticator app on, the server holds a new session until its code is
 * entered: the gate asks for it, and signing in carries on once it passes. Giving up ends the
 * held session on the server and here.
 */
async function readMe() {
  try {
    return (await api.GET('/me')).data;
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'MFA_REQUIRED')) throw err;
    try {
      await useMfaGate.getState().passed();
    } catch (cancelled) {
      await api.POST('/auth/sign-out', {}).catch(() => {});
      await setTokens(null);
      throw cancelled;
    }
    return (await api.GET('/me')).data;
  }
}

export { MfaCancelled };

export async function signIn(email: string, password: string) {
  const { data } = await api.POST('/auth/sign-in', { body: { email: email.trim(), password, device: device() } });
  await begin(data!);
}

/**
 * The public demo's sign-in, from the server (so no build carries it), or null when the demo is
 * switched off or can't be reached. Asked once per launch.
 */
export function getDemoLogin(): Promise<{ email: string; password: string } | null> {
  demoLogin ??= api.GET('/auth/demo').then(
    ({ data }) => (data?.email && data.password ? { email: data.email, password: data.password } : null),
    () => {
      demoLogin = null;
      return null;
    },
  );
  return demoLogin;
}
let demoLogin: Promise<{ email: string; password: string } | null> | null = null;

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

/** Forgets the session and everything loaded for it. */
function clearLocal() {
  endRefreshSession();
  analytics.reset();
  useRemoteMeta.getState().reset();
  useAppStore.setState({
    ...emptyData(),
    activeCompanyId: '',
    activeBranchId: '',
    session: { userId: null, authenticated: false, onboardingComplete: false },
  });
}

export async function signOut() {
  // While still signed in, so the server knows whose token it is.
  await unregisterPush();
  try {
    await api.POST('/auth/sign-out', {});
  } catch {
    // Signing out works offline too; the server session expires on its own.
  }
  await setTokens(null);
  clearLocal();
}

/**
 * Deletes the account on the server, then forgets everything here. Unlike signing out, changes still
 * waiting to send are dropped rather than kept for a next sign-in that won't come. Throws (and
 * changes nothing locally) when the server refuses.
 */
export async function deleteAccount(body: Schema<'DeleteAccountRequest'>) {
  await api.POST('/me/delete', { body });
  // The server already dropped the token; forget it here too.
  await AsyncStorage.removeItem('ebs.push.token').catch(() => {});
  await AsyncStorage.removeItem(ACTIVE_KEY).catch(() => {});
  await setTokens(null);
  clearLocal();
}

/** A refresh the server refused (revoked device, reset password) signs out here too. */
export function watchSessionEnd(): () => void {
  return onTokensChange((t) => {
    if (!t && useAppStore.getState().session.authenticated) clearLocal();
  });
}

/** Loads everything the open business needs from the server again. */
export async function resync() {
  await refreshNow();
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
