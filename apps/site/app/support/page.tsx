import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { support } from '@/content/legal';

export const metadata: Metadata = { title: `${support.title} · Elixir Books Smart` };

export default function Page() {
  return <LegalPage doc={support} />;
}
