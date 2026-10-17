import { ApiError } from '@esmart/api-client';
import type { Schema } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { syncNow } from './sync';

type User = Schema<'User'>;

/**
 * Team invitations. Unlike most edits these go straight to the API instead of
 * through the offline queue: the server decides whether the invitation can be
 * sent (plan limit, address already in use, email delivery), and the person
 * inviting has to see that answer, not a row that appears and later vanishes.
 */
export async function inviteUser(input: { name: string; email: string; role: NonNullable<User['role']>; companyIds: string[]; branchIds?: string[] }): Promise<User> {
  try {
    const { data } = await api.POST('/users', { body: { ...input, email: input.email.trim(), name: input.name.trim() } });
    const created = data as User;
    useAppStore.setState((s) => ({ users: [...s.users.filter((u) => u.id !== created.id), created as never] }));
    return created;
  } catch (err) {
    // The invitation is saved even when the email couldn't be sent: bring it in so it can be resent.
    if (err instanceof ApiError && err.code === 'EMAIL_SEND_FAILED') void syncNow();
    throw err;
  }
}

/** Sends an open invitation again with a fresh link. */
export async function resendInvite(userId: string): Promise<void> {
  await api.POST('/users/{userId}/resend-invite', { params: { path: { userId } } });
}
