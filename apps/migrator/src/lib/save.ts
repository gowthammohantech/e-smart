/** Where a saved file went, or that the person changed their mind. */
export type Saved = { path?: string; cancelled?: boolean };

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Hands the person a file. In the desktop app that is a real Save dialog, which is the only dependable
 * way to save from its window; in a browser it is an ordinary download.
 */
export async function saveFile(name: string, bytes: Uint8Array): Promise<Saved> {
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('save_file', { name, data: Array.from(bytes) });
    return path ? { path } : { cancelled: true };
  }
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { path: `Downloads/${name}` };
}
