import type { Metadata } from 'next';

import { brand } from '@/content/site';
import { cookbookNav, cookbookPage } from '@/lib/cookbook';

type Params = { part: string; page: string };

// A static export: only the pages that exist in docs/cookbook are built.
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return cookbookNav().flatMap((part) => part.pages.map((p) => ({ part: part.dir, page: p.page })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { part, page } = await params;
  return { title: `${cookbookPage(part, page).title} — ${brand.name} Cookbook` };
}

export default async function CookbookPage({ params }: { params: Promise<Params> }) {
  const { part, page } = await params;
  const { html } = cookbookPage(part, page);
  return <article className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
