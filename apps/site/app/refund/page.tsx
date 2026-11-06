import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { refund } from '@/content/legal';

export const metadata: Metadata = { title: `${refund.title} · Elixir Books Smart` };

export default function Page() {
  return <LegalPage doc={refund} />;
}
