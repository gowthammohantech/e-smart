import type { Metadata } from 'next';

import { brand } from '@/content/site';
import { cookbookIndex } from '@/lib/cookbook';

export const metadata: Metadata = {
  title: 'Cookbook',
  description: `How to use every feature of ${brand.name}, step by step.`,
};

export default function CookbookIndex() {
  const { html } = cookbookIndex();
  return <article className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
