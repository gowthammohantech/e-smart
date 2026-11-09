/**
 * `placeholderData` for a business's lists: while a new filter, tab or period loads, the last answer
 * stays on screen rather than flashing empty — but only an answer for the same business. After a
 * switch there is nothing to keep, so the screen shows its shimmer instead of the other books.
 */
export function keepWithin(companyId: string) {
  return <T>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    companyId && previousQuery?.queryKey.includes(companyId) ? previous : undefined;
}
