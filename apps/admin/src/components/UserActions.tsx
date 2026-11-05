import { useQueryClient } from '@tanstack/react-query';
import { useState, type MouseEvent } from 'react';
import { api, type Schema } from '../lib/api';
import { useOperator } from '../auth/AuthProvider';
import { Can } from './Can';
import { ReasonDialog } from './ReasonDialog';

type RoleChoice = Schema<'PlatformRole'> | 'none';

const ROLE_HELP: Record<RoleChoice, string> = {
  superadmin: 'Superadmin: sees every business and can suspend accounts, change plans, disable users and manage operators.',
  support: 'Support: can look at every business but change nothing.',
  none: 'No platform access: an ordinary business user again.',
};

/** Disable or re-enable one user, and grant or remove platform operator access. Superadmins only. */
export function UserActions({ user }: { user: Schema<'PlatformUser'> }) {
  const queryClient = useQueryClient();
  const operator = useOperator();
  const [open, setOpen] = useState<'toggle' | 'role' | null>(null);
  const [role, setRole] = useState<RoleChoice>('superadmin');
  const enable = user.status === 'disabled';
  const self = user.id === operator.id;
  const current: RoleChoice = user.platformRole ?? 'none';

  function openRole(e: MouseEvent) {
    e.stopPropagation();
    setRole(current === 'none' ? 'superadmin' : current === 'superadmin' ? 'support' : 'superadmin');
    setOpen('role');
  }

  return (
    <Can role="superadmin">
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {self ? <span className="muted cell-sub">You</span> : null}
        {!self && !enable ? (
          <button className="btn small" type="button" onClick={openRole}>
            {user.platformRole ? 'Change role' : 'Make operator'}
          </button>
        ) : null}
        {/* Operators lose their role before they can be disabled. */}
        {!user.platformRole ? (
          <button className={`btn small ${enable ? '' : 'danger'}`} type="button" onClick={(e) => (e.stopPropagation(), setOpen('toggle'))}>
            {enable ? 'Enable' : 'Disable'}
          </button>
        ) : null}
      </span>
      {open === 'toggle' ? (
        <ReasonDialog
          open
          title={`${enable ? 'Enable' : 'Disable'} ${user.name}`}
          description={
            enable
              ? `${user.email} will be able to sign in again.`
              : `${user.email} will be signed out on every device and can't sign in until enabled again.`
          }
          confirmLabel={enable ? 'Enable user' : 'Disable user'}
          danger={!enable}
          onClose={() => setOpen(null)}
          onConfirm={async (reason) => {
            const path = enable ? '/admin/users/{userId}/enable' : '/admin/users/{userId}/disable';
            await api.POST(path, { params: { path: { userId: user.id } }, body: { reason } });
            await queryClient.invalidateQueries();
          }}
        />
      ) : null}
      {open === 'role' ? (
        <ReasonDialog
          open
          title={`Platform role for ${user.name}`}
          description={`${user.email} will be signed out everywhere. A new role takes effect at their next sign-in, where operators must set up an authenticator app.`}
          confirmLabel={role === 'none' ? 'Remove access' : role === 'superadmin' ? 'Make superadmin' : 'Make support'}
          danger={role === 'superadmin' || role === 'none'}
          onClose={() => setOpen(null)}
          onConfirm={async (reason) => {
            if (role === current) throw new Error(`${user.name} already has this role`);
            await api.PUT('/admin/users/{userId}/platform-role', {
              params: { path: { userId: user.id } },
              body: { platformRole: role === 'none' ? null : role, reason },
            });
            await queryClient.invalidateQueries();
          }}
        >
          <label className="field">
            <span>Platform role</span>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as RoleChoice)}>
              <option value="superadmin">Superadmin</option>
              <option value="support">Support</option>
              <option value="none">None</option>
            </select>
            <span className="hint">
              {ROLE_HELP[role]} Currently: {current === 'none' ? 'none' : current}.
            </span>
          </label>
        </ReasonDialog>
      ) : null}
    </Can>
  );
}
