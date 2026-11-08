/** A picked file's bytes, for an upload. Throws when the file can't be read any more. */
export async function fileBlob(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}
