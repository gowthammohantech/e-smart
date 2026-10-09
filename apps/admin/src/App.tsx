import { createBrowserRouter, RouterProvider } from 'react-router';
import { RequireOperator } from './auth/RequireOperator';
import { AppShell } from './components/AppShell';
import { AccountDetail } from './pages/AccountDetail';
import { Accounts } from './pages/Accounts';
import { AuditLog } from './pages/AuditLog';
import { CompanyDetail } from './pages/CompanyDetail';
import { NotFound } from './pages/NotFound';
import { SignIn } from './pages/SignIn';
import { Users } from './pages/Users';

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignIn /> },
  {
    element: (
      <RequireOperator>
        <AppShell />
      </RequireOperator>
    ),
    children: [
      // Charts are the heaviest dependency; only the overview needs them.
      { index: true, lazy: async () => ({ Component: (await import('./pages/Dashboard')).Dashboard }) },
      { path: 'accounts', element: <Accounts /> },
      { path: 'accounts/:accountId', element: <AccountDetail /> },
      { path: 'companies/:companyId', element: <CompanyDetail /> },
      { path: 'users', element: <Users /> },
      { path: 'audit', element: <AuditLog /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
