import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { deleteAccount } from '@/content/legal';

export const metadata: Metadata = {
  title: deleteAccount.title,
  description: 'How to delete your Elixir Books Smart account and what happens to your data.',
};

export default function Page() {
  return <LegalPage doc={deleteAccount} />;
}
