import { Platform } from 'react-native';
import type { Schema } from '@esmart/api-client';
import { emptyData, useAppStore } from '../store/appStore';
import { api } from './api';
import { useRemoteMeta } from './meta';
import { loadSnapshot } from './sync';
import { onTokensChange, setTokens } from './tokens';

type AuthSession = Schema<'AuthSession'>;

const device = () => ({ label: Platform.OS === 'web' ? 'Web browser' : `${Platform.OS} app`, platform: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim() });

/**
 * Starts a session from the API's AuthSession: stores the tokens, loads the
 * account's data into an empty store, then marks the session signed in, so
 * the first screen the router shows already has data.
 */
async function begin(auth: AuthSession) {
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
  const companyId = me?.defaultCompanyId ?? s.companies[0]?.id ?? '';
  const branches = s.branches.filter((b) => b.companyId === companyId);
  useAppStore.setState({
    activeCompanyId: companyId,
    activeBranchId: (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? '',
    session: { userId: auth.user.id, authenticated: true, onboardingComplete: !!(me?.onboardingComplete ?? auth.onboardingComplete), signedInAt: new Date().toISOString() },
  });
}

export async function signIn(email: string, password: string) {
  const { data } = await api.POST('/auth/sign-in', { body: { email: email.trim(), password, device: device() } });
  await begin(data!);
}

export async function signUp(input: { name: string; email: string; phone?: string; password: string; locale?: string }) {
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

/** Forgets the session and everything loaded for it on this device. */
function clearLocal() {
  useRemoteMeta.getState().reset();
  useAppStore.setState({
    ...emptyData(),
    activeCompanyId: '',
    activeBranchId: '',
    session: { userId: null, authenticated: false, onboardingComplete: false },
  });
}

export async function signOut() {
  try {
    await api.POST('/auth/sign-out', {});
  } catch {
    // Signing out works offline too; the server session expires on its own.
  }
  await setTokens(null);
  clearLocal();
}

/** A refresh the server refused (revoked device, reset password) signs out here too. */
export function watchSessionEnd(): () => void {
  return onTokensChange((t) => {
    if (!t && useAppStore.getState().session.authenticated) clearLocal();
  });
}

/** Reloads everything from the server, keeping the session (Settings → Sync). */
export async function resync() {
  const { session, activeCompanyId, activeBranchId, syncQueue } = useAppStore.getState();
  useAppStore.setState({ ...emptyData(), syncQueue, session, activeCompanyId, activeBranchId });
  await loadSnapshot();
}
