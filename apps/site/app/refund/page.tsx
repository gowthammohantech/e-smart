import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { refund } from '@/content/legal';

export const metadata: Metadata = {
  title: refund.title,
  description: 'How cancellations and refunds work for Elixir Books Smart subscriptions.',
};

export default function Page() {
  return <LegalPage doc={refund} />;
}
