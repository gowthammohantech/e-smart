import { pathToFileURL } from 'node:url';

/**
 * Whether the module at `moduleUrl` (its `import.meta.url`) is the script being run, not one being
 * imported. Compared as file URLs, so a Windows path (C:\…) matches as well as a POSIX one.
 */
export function runDirectly(moduleUrl: string): boolean {
  return !!process.argv[1] && moduleUrl === pathToFileURL(process.argv[1]).href;
}
