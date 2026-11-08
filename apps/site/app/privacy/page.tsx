import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { privacy } from '@/content/legal';

export const metadata: Metadata = {
  title: privacy.title,
  description: 'What Elixir Books Smart collects, why, who processes it, how long it is kept, and your rights under the DPDP Act, 2023.',
};

export default function Page() {
  return <LegalPage doc={privacy} />;
}
