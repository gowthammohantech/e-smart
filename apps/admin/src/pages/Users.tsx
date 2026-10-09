import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { RoleBadge, UserStatusBadge } from '../components/Badges';
import { PageHeader, Pager, QueryState, RowLink, SearchInput } from '../components/ui';
import { UserActions } from '../components/UserActions';
import { api, need, type Schema } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useCursorPager } from '../lib/useCursorPager';

export function Users() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') || undefined) as Schema<'PlatformUser'>['status'] | undefined;
  const pager = useCursorPager();
  const { reset } = pager;
  useEffect(reset, [q, status, reset]);

  const setParam = useCallback(
    (key: string, value: string) =>
      setParams(
        (p) => {
          if (value) p.set(key, value);
          else p.delete(key);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const query = useQuery({
    queryKey: ['users', { q, status, cursor: pager.cursor }],
    queryFn: async () => need(await api.GET('/admin/users', { params: { query: { q: q || undefined, status, cursor: pager.cursor, limit: 25 } } })),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Users" sub="Everyone with a login, across every account." />
      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search name, email or phone" />
          <select className="select" aria-label="Status" value={status ?? ''} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <QueryState isPending={query.isPending} error={query.error}>
          {() =>
            query.data!.data!.length === 0 ? (
              <div className="empty">No users match.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Account</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last active</th>
                        <th>Joined</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {query.data!.data!.map((u) => (
                        <tr key={u.id}>
                          <td>
                            {u.name}
                            <div className="cell-sub">
                              {u.email}
                              {u.phone ? ` · ${u.phone}` : ''}
                            </div>
                          </td>
                          <td>
                            <RowLink to={`/accounts/${u.accountId}`}>{u.accountName}</RowLink>
                            {u.accountSuspended ? <div className="cell-sub">Account suspended</div> : null}
                          </td>
                          <td>
                            <span style={{ textTransform: 'capitalize' }}>{u.role}</span> {u.platformRole ? <RoleBadge role={u.platformRole} /> : null}
                          </td>
                          <td>
                            <UserStatusBadge status={u.status} />
                          </td>
                          <td>{fmtDateTime(u.lastActiveAt)}</td>
                          <td>{fmtDate(u.createdAt)}</td>
                          <td className="right">
                            <UserActions user={u} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={pager.page} hasPrev={pager.hasPrev} nextCursor={query.data!.nextCursor} onPrev={pager.prev} onNext={pager.next} />
              </>
            )
          }
        </QueryState>
      </section>
    </div>
  );
}
