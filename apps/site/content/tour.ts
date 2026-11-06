/**
 * Lixi's walk through the page: one stop per section, the margin Lixi stands
 * in, and what Lixi says there. The section's 3D props take the other margin.
 * Kept apart from content/site.ts so client code can import it without the
 * i18n catalogue that file pulls in.
 */
export type TourStop = { id: string; side: 'left' | 'right'; line: string };

export const lixiTour: TourStop[] = [
  { id: 'top', side: 'right', line: "Hi, I'm Lixi. I keep an eye on your books — let me show you around." },
  { id: 'about', side: 'left', line: 'One set of books for sales, purchases, stock and money.' },
  { id: 'how-it-works', side: 'right', line: 'Set up in five steps, then bill and file in one go.' },
  { id: 'features', side: 'left', line: "GST is on every plan. I'll flag anything that needs fixing." },
  { id: 'all-in-one', side: 'right', line: "Ask me “who owes me?” — I'll answer and draft the reminder." },
  { id: 'pricing', side: 'left', line: 'Start free. Move up when you buy and keep stock too.' },
  { id: 'faq', side: 'right', line: 'Still wondering? These are the questions I hear most.' },
  { id: 'testimonials', side: 'left', line: "Here's what owners say once I'm on the team." },
];

/** The margin Lixi leaves free in a section, for that section's props. */
export function propSideFor(id: string): -1 | 1 {
  return lixiTour.find((s) => s.id === id)?.side === 'left' ? 1 : -1;
}
