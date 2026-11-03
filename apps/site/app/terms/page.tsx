import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { terms } from '@/content/legal';

export const metadata: Metadata = { title: `${terms.title} · Elixir Books Smart` };

export default function Page() {
  return <LegalPage doc={terms} />;
}
