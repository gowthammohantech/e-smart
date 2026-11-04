import { Link } from 'react-router';
import { EmptyState, PageHeader } from '../components/ui';

export function NotFound() {
  return (
    <div>
      <PageHeader title="Not found" sub="There's nothing at this address." />
      <div className="card">
        <EmptyState art="not-found" title="This page doesn’t exist">
          It may have moved, or the link was mistyped. <Link to="/">Back to the overview</Link>
        </EmptyState>
      </div>
    </div>
  );
}
