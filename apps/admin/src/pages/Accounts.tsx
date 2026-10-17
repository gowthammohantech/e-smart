import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AccountStatusBadge, PlanBadge } from '../components/Badges';
import { PageHeader, Pager, QueryState, RowLink, SearchInput } from '../components/ui';
import { api, need, type Schema } from '../lib/api';
import { fmtDate, fmtInt, PLAN_LABELS, PLANS } from '../lib/format';
import { useCursorPager } from '../lib/useCursorPager';

type Status = 'active' | 'suspended';

export function Accounts() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const status = (params.get('status') || undefined) as Status | undefined;
  const plan = (params.get('plan') || undefined) as Schema<'PlanTier'> | undefined;
  const pager = useCursorPager();
  const { reset } = pager;
  useEffect(reset, [q, status, plan, reset]);

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
    queryKey: ['accounts', { q, status, plan, cursor: pager.cursor }],
    queryFn: async () => need(await api.GET('/admin/accounts', { params: { query: { q: q || undefined, status, plan, cursor: pager.cursor, limit: 25 } } })),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Accounts" sub="Every tenant on the platform. An account holds one or more companies and their team." />
      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search account, company, owner name or email" />
          <select className="select" aria-label="Status" value={status ?? ''} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select className="select" aria-label="Plan" value={plan ?? ''} onChange={(e) => setParam('plan', e.target.value)}>
            <option value="">Any plan</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <QueryState isPending={query.isPending} error={query.error}>
          {() =>
            query.data!.data!.length === 0 ? (
              <div className="empty">No accounts match.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Status</th>
                        <th>Plans</th>
                        <th className="right">Companies</th>
                        <th className="right">Users</th>
                        <th>Last active</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data!.data!.map((a) => (
                        <tr key={a.id} className="link" onClick={() => navigate(`/accounts/${a.id}`)}>
                          <td>
                            <RowLink to={`/accounts/${a.id}`}>{a.name}</RowLink>
                            <div className="cell-sub">{a.ownerEmail ?? 'No owner'}</div>
                          </td>
                          <td>
                            <AccountStatusBadge status={a.status} />
                          </td>
                          <td>
                            <div className="row">{a.plans.length ? a.plans.map((p) => <PlanBadge key={p} plan={p} />) : <span className="muted">—</span>}</div>
                          </td>
                          <td className="right num">{fmtInt(a.companyCount)}</td>
                          <td className="right num">{fmtInt(a.userCount)}</td>
                          <td>{fmtDate(a.lastActiveAt)}</td>
                          <td>{fmtDate(a.createdAt)}</td>
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
