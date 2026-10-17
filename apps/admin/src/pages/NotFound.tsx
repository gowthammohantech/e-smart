import { Link } from 'react-router';
import { PageHeader } from '../components/ui';

export function NotFound() {
  return (
    <div>
      <PageHeader title="Not found" sub="There's nothing at this address." />
      <Link to="/">Back to the overview</Link>
    </div>
  );
}
