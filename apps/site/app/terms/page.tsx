import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { terms } from '@/content/legal';

export const metadata: Metadata = {
  title: terms.title,
  description: 'The terms for using Elixir Books Smart: your account, plans and billing, acceptable use and our responsibilities.',
};

export default function Page() {
  return <LegalPage doc={terms} />;
}
