import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AuditList } from '../components/AuditList';
import { AccountStatusBadge, PlanBadge, RoleBadge, SubscriptionBadge, UserStatusBadge } from '../components/Badges';
import { Can } from '../components/Can';
import { ReasonDialog } from '../components/ReasonDialog';
import { PageHeader, QueryState, RowLink, EmptyState, DetailSkeleton } from '../components/ui';
import { UserActions } from '../components/UserActions';
import { api, need, type Schema } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';

function SuspendAction({ account }: { account: Schema<'PlatformAccount'> }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const suspended = account.status === 'suspended';
  // Closed by its last owner deleting themselves: their login is gone, so a new owner is invited.
  const ownerDeleted = suspended && account.suspendedReason === 'owner-deleted';
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  return (
    <Can role="superadmin">
      <button
        className={`btn ${suspended ? 'primary' : 'danger'}`}
        type="button"
        onClick={() => {
          setOwnerName('');
          setOwnerEmail('');
          setOpen(true);
        }}
      >
        {suspended ? 'Reactivate account' : 'Suspend account'}
      </button>
      <ReasonDialog
        open={open}
        title={suspended ? `Reactivate ${account.name}` : `Suspend ${account.name}`}
        description={
          ownerDeleted
            ? 'The owner closed this account by deleting their own, so their sign-in no longer exists. Invite a new owner: they get every business on the account, and an email to set a password. The same person may come back with the same email, unless it already has an account of its own.'
            : suspended
              ? 'Everyone on this account can sign in again. Sessions ended by the suspension stay signed out.'
              : `All ${account.userCount} user(s) are signed out on every device straight away, and nobody on the account can sign in until it is reactivated. Their data is kept.`
        }
        confirmLabel={ownerDeleted ? 'Reactivate and invite' : suspended ? 'Reactivate' : 'Suspend account'}
        danger={!suspended}
        onClose={() => setOpen(false)}
        onConfirm={async (reason) => {
          if (!suspended) {
            need(await api.POST('/admin/accounts/{accountId}/suspend', { params: { path: { accountId: account.id } }, body: { reason } }));
          } else {
            if (ownerDeleted && (!ownerName.trim() || !ownerEmail.trim())) throw new Error('Enter the new owner’s name and email');
            const owner = ownerDeleted ? { ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim() } : {};
            need(await api.POST('/admin/accounts/{accountId}/reactivate', { params: { path: { accountId: account.id } }, body: { reason, ...owner } }));
          }
          await queryClient.invalidateQueries();
        }}
      >
        {ownerDeleted ? (
          <>
            <label className="field">
              <span>New owner’s name</span>
              <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={100} required />
            </label>
            <label className="field">
              <span>New owner’s email</span>
              <input className="input" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} maxLength={254} required />
              <span className="hint">They get an invite to set a password and sign in as owner.</span>
            </label>
          </>
        ) : null}
      </ReasonDialog>
    </Can>
  );
}

export function AccountDetail() {
  const { accountId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['account', accountId],
    queryFn: async () => need(await api.GET('/admin/accounts/{accountId}', { params: { path: { accountId } } })),
  });

  return (
    <QueryState
      isPending={query.isPending}
      error={query.error}
      fallback={<DetailSkeleton crumbs={[{ to: '/accounts', label: 'Accounts' }]} />}
      header={<PageHeader crumbs={[{ to: '/accounts', label: 'Accounts' }]} title="Account" />}
    >
      {() => {
        const { account, companies, users } = query.data!;
        return (
          <div className="stack">
            <PageHeader
              crumbs={[{ to: '/accounts', label: 'Accounts' }]}
              title={
                <span className="row" style={{ gap: 12 }}>
                  {account.name} <AccountStatusBadge status={account.status} />
                </span>
              }
              docTitle={account.name}
              sub={<span className="mono">{account.id}</span>}
              actions={<SuspendAction account={account} />}
            />

            {account.status === 'suspended' ? (
              <div className="alert bad">
                Suspended {fmtDateTime(account.suspendedAt)}. Reason: {account.suspendedReason ?? '—'}
              </div>
            ) : null}

            <section className="card card-body">
              <dl className="facts">
                <div>
                  <dt>Owner</dt>
                  <dd>
                    {account.ownerName ?? '—'}
                    <div className="cell-sub">{account.ownerEmail}</div>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{fmtDate(account.createdAt)}</dd>
                </div>
                <div>
                  <dt>Last active</dt>
                  <dd>{fmtDateTime(account.lastActiveAt)}</dd>
                </div>
                <div>
                  <dt>Companies / users</dt>
                  <dd className="num">
                    {account.companyCount} / {account.userCount}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Companies</h2>
              </div>
              {companies.length === 0 ? (
                <EmptyState title="No company yet">This account hasn’t created a company yet.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Plan</th>
                        <th>Subscription</th>
                        <th>Tax ID</th>
                        <th>Onboarded</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((c) => (
                        <tr key={c.id} className="link" onClick={() => navigate(`/companies/${c.id}`)}>
                          <td>
                            <RowLink to={`/companies/${c.id}`}>{c.name}</RowLink>
                            <div className="cell-sub">
                              {c.city}, {c.country}
                            </div>
                          </td>
                          <td>
                            <PlanBadge plan={c.plan} />
                          </td>
                          <td>
                            <SubscriptionBadge status={c.subscriptionStatus} />
                          </td>
                          <td className="mono">{c.taxIdentifier ?? '—'}</td>
                          <td>{c.onboardingCompletedAt ? fmtDate(c.onboardingCompletedAt) : <span className="muted">Not yet</span>}</td>
                          <td>{fmtDate(c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Users</h2>
              </div>
              {users.length === 0 ? (
                <EmptyState title="No users">Nobody is on this account yet.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last active</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            {u.name}
                            <div className="cell-sub">
                              {u.email}
                              {u.phone ? ` · ${u.phone}` : ''}
                            </div>
                          </td>
                          <td>
                            <span style={{ textTransform: 'capitalize' }}>{u.role}</span> {u.platformRole ? <RoleBadge role={u.platformRole} /> : null}
                          </td>
                          <td>
                            <UserStatusBadge status={u.status} />
                          </td>
                          <td>{fmtDateTime(u.lastActiveAt)}</td>
                          <td className="right">
                            <UserActions user={u} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Operator actions on this account</h2>
              </div>
              <AuditList filters={{ targetType: 'account', targetId: account.id }} limit={10} compact />
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}
