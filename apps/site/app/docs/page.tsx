import type { Metadata } from 'next';

import { brand } from '@/content/site';
import { cookbookIndex } from '@/lib/cookbook';

export const metadata: Metadata = {
  title: `Cookbook — ${brand.name}`,
  description: 'How to use every feature of Elixir Books Smart, and the scenarios that test it.',
};

export default function CookbookIndex() {
  const { html } = cookbookIndex();
  return <article className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
