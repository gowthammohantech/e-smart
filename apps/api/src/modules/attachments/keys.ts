/**
 * Object-store key for an attachment. Short and free of user input: the
 * file name lives in the row, and the memory store's signed URLs carry the
 * whole key in one path segment, which the router caps at 100 characters.
 */
export function storageKeyFor(companyId: string, attachmentId: string): string {
  return `${companyId}/${attachmentId}`;
}
