import type { IconName } from '@esmart/ui/components/Icon';
import type { Company } from '@esmart/core/types';
import { useActiveCompany, useCanOpen } from '../../store/selectors';
import { useAppStore } from '../../store/appStore';
import { useCompanyUsage } from '../../remote/queries';

export type SetupStep = {
  /** Also the catalogue key: reports:home.step.<key>.title / .body */
  key: 'profile' | 'gst' | 'customer' | 'item' | 'invoice' | 'team';
  icon: IconName;
  route: string;
  done: boolean;
};

/**
 * What a new business still has to set up, each with where to do it and
 * whether it's done: the profile that prints on invoices, GST, a first
 * customer, item and invoice, and a teammate. Steps the user can't open (plan
 * or role) are left out. `loading` while the server's counts are on the way.
 */
export function useSetupSteps(): { steps: SetupStep[]; doneCount: number; complete: boolean; loading: boolean } {
  const canOpen = useCanOpen();
  // Briefly undefined while signing out, before the router leaves the screen.
  const company = useActiveCompany() as Company | undefined;
  const usage = useCompanyUsage();
  const counts = usage.data?.counts;
  const teammates = useAppStore((s) => s.users.filter((u) => company && u.companyIds.includes(company.id)).length);

  const reg = company?.taxRegistration;
  const all: SetupStep[] = [
    {
      key: 'profile',
      icon: 'storefront-outline',
      route: '/(app)/settings/company',
      done: !!company?.logoUri && !!company.address?.line1 && !!(company.phone || company.email),
    },
    {
      key: 'gst',
      icon: 'percent-outline',
      route: '/(app)/settings/company',
      // Registered with a GSTIN on file, or chosen as not registered.
      done: !!reg && (!reg.registered || !!reg.identifier),
    },
    { key: 'customer', icon: 'account-plus-outline', route: '/(app)/contacts/customers/new', done: (counts?.customers ?? 0) > 0 },
    { key: 'item', icon: 'tag-plus-outline', route: '/(app)/catalog/items/new', done: (counts?.items ?? 0) > 0 },
    { key: 'invoice', icon: 'file-document-edit-outline', route: '/(app)/sales/invoices/new', done: (counts?.invoices ?? 0) > 0 },
    { key: 'team', icon: 'account-group-outline', route: '/(app)/settings/users', done: teammates > 1 },
  ];
  const steps = all.filter((s) => canOpen(s.route));
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, complete: doneCount === steps.length, loading: usage.isLoading };
}
