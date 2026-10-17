import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Schema } from '../lib/api';
import { Can } from './Can';
import { ReasonDialog } from './ReasonDialog';

/** Disable or re-enable one user. Operators themselves are managed outside the console. */
export function UserActions({ user }: { user: Schema<'PlatformUser'> }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  if (user.platformRole) return <span className="muted cell-sub">Operator</span>;
  const enable = user.status === 'disabled';
  return (
    <Can role="superadmin">
      <button className={`btn small ${enable ? '' : 'danger'}`} type="button" onClick={(e) => (e.stopPropagation(), setOpen(true))}>
        {enable ? 'Enable' : 'Disable'}
      </button>
      {open ? (
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
        onClose={() => setOpen(false)}
        onConfirm={async (reason) => {
          const path = enable ? '/admin/users/{userId}/enable' : '/admin/users/{userId}/disable';
          await api.POST(path, { params: { path: { userId: user.id } }, body: { reason } });
          await queryClient.invalidateQueries();
        }}
        />
      ) : null}
    </Can>
  );
}
