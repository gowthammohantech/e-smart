import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { support } from '@/content/legal';

export const metadata: Metadata = {
  title: support.title,
  description: 'How to reach the Elixir Books Smart team for help: phone, email and office hours.',
};

export default function Page() {
  return <LegalPage doc={support} />;
}
