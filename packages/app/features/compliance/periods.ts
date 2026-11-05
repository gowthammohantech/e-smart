import { formatDate } from '@esmart/core/lib/date';

/** The last twelve return periods, newest first, as MMYYYY. */
export function recentPeriods(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
  });
}

export const periodLabel = (p: string) => formatDate(`${p.slice(2)}-${p.slice(0, 2)}-01`, 'MMM yyyy');
