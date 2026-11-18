import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schema } from '../lib/api';
import { GspProvider } from './CompanyDetail';

const put = vi.hoisted(() => vi.fn());
const role = vi.hoisted(() => ({ current: 'superadmin' as 'superadmin' | 'support' }));

vi.mock('../lib/api', async (original) => ({ ...(await original<typeof import('../lib/api')>()), api: { PUT: put } }));
vi.mock('../auth/AuthProvider', () => ({ useOperator: () => ({ platformRole: role.current }) }));

const company = { id: 'cmp_1', name: 'Acme Traders' } as Schema<'PlatformCompany'>;

const OPTIONS: Schema<'PlatformGsp'>['options'] = [
  { gateway: 'adaequare', environment: 'production', available: true, reason: null },
  { gateway: 'adaequare', environment: 'sandbox', available: true, reason: null },
  { gateway: 'whitebooks', environment: 'sandbox', available: true, reason: null },
  { gateway: 'whitebooks', environment: 'production', available: false, reason: 'Not set up here: TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL is missing.' },
];

const gsp = (over: Partial<Schema<'PlatformGsp'>> = {}): Schema<'PlatformGsp'> => ({
  override: null,
  default: { gateway: 'whitebooks', environment: 'sandbox' },
  effective: { gateway: 'whitebooks', environment: 'sandbox' },
  simulated: false,
  options: OPTIONS,
  ...over,
});

function show(value: Schema<'PlatformGsp'>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GspProvider company={company} gsp={value} />
    </QueryClientProvider>,
  );
}

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Change gateway' }));
  return screen.getByRole('dialog', { hidden: true });
}

beforeEach(() => {
  put.mockReset();
  put.mockResolvedValue({ data: {} });
  role.current = 'superadmin';
});

describe('GspProvider', () => {
  it('names the gateway and environment the company files through, whether or not anyone chose it', () => {
    show(gsp());
    expect(screen.getByText('Files through').nextElementSibling?.textContent).toBe('Whitebooks – Sandbox');
    // Nothing says where it came from.
    expect(screen.queryByText(/default/i)).toBeNull();
  });

  it('names a target an operator chose in just the same way', () => {
    const target = { gateway: 'adaequare', environment: 'production' } as const;
    show(gsp({ override: target, effective: target }));
    expect(screen.getByText('Files through').nextElementSibling?.textContent).toBe('Adaequare – Production');
  });

  it('offers all four targets in one list, with the current one selected', async () => {
    show(gsp());
    const dialog = await openDialog();
    const select = within(dialog).getByRole('combobox') as HTMLSelectElement;
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Adaequare – Production',
      'Adaequare – Sandbox',
      'Whitebooks – Sandbox (current)',
      'Whitebooks – Production (not available)',
    ]);
    expect(select.value).toBe('whitebooks:sandbox');
  });

  it('lists a target the deployment cannot run, disabled, with the reason', async () => {
    show(gsp());
    const dialog = await openDialog();
    const option = within(dialog).getByRole('option', { name: /Whitebooks – Production/ }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain('not available');
  });

  it('notes that a simulated deployment calls no gateway', () => {
    show(gsp({ simulated: true }));
    expect(screen.getByText(/built-in simulator/)).toBeTruthy();
  });

  it('keeps the control from support, who could not use it', () => {
    role.current = 'support';
    show(gsp());
    expect(screen.queryByRole('button', { name: 'Change gateway' })).toBeNull();
  });

  it('sends the chosen gateway and environment with the reason', async () => {
    show(gsp());
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'adaequare:sandbox');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Customer asked to move');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change gateway' }));

    expect(put).toHaveBeenCalledWith('/admin/companies/{companyId}/gsp-provider', {
      params: { path: { companyId: 'cmp_1' } },
      body: { provider: 'adaequare', environment: 'sandbox', reason: 'Customer asked to move' },
    });
  });

  it('sends the same gateway in another environment', async () => {
    show(gsp({ effective: { gateway: 'adaequare', environment: 'sandbox' } }));
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'adaequare:production');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Going live');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change gateway' }));

    expect(put).toHaveBeenCalledWith('/admin/companies/{companyId}/gsp-provider', {
      params: { path: { companyId: 'cmp_1' } },
      body: { provider: 'adaequare', environment: 'production', reason: 'Going live' },
    });
  });

  it('does not send a change to the target the company already files through', async () => {
    show(gsp());
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByRole('textbox'), 'No real change');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change gateway' }));

    expect(put).not.toHaveBeenCalled();
    expect((await within(dialog).findByRole('alert')).textContent).toContain('already files through Whitebooks – Sandbox');
  });
});
