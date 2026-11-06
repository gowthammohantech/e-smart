import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { deleteAccount } from '@/content/legal';

export const metadata: Metadata = { title: `${deleteAccount.title} · Elixir Books Smart` };

export default function Page() {
  return <LegalPage doc={deleteAccount} />;
}
