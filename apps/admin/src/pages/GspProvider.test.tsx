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

const gsp = (over: Partial<Schema<'PlatformGsp'>> = {}): Schema<'PlatformGsp'> => ({
  override: null,
  default: 'adaequare',
  effective: 'adaequare',
  simulated: false,
  options: [
    { gateway: 'adaequare', available: true, sandboxOnly: false, reason: null },
    { gateway: 'whitebooks', available: true, sandboxOnly: true, reason: null },
  ],
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
  it('names the gateway the company files through, whether or not anyone chose it', () => {
    show(gsp());
    expect(screen.getByText('Files through').nextElementSibling?.textContent).toBe('Adaequare');
    // Nothing says where it came from.
    expect(screen.queryByText(/default/i)).toBeNull();
  });

  it('names a gateway an operator chose in just the same way', () => {
    show(gsp({ override: 'whitebooks', effective: 'whitebooks' }));
    expect(screen.getByText('Files through').nextElementSibling?.textContent).toBe('Whitebooks (sandbox)');
  });

  it('offers only the two gateways, with the current one selected', async () => {
    show(gsp({ effective: 'whitebooks' }));
    const dialog = await openDialog();
    const select = within(dialog).getByRole('combobox') as HTMLSelectElement;
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Adaequare', 'Whitebooks (sandbox) (current)']);
    expect(select.value).toBe('whitebooks');
    expect(within(dialog).queryByText(/default/i)).toBeNull();
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

  it('sends the chosen gateway with the reason', async () => {
    show(gsp());
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByRole('combobox'), 'whitebooks');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Customer asked to move');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change gateway' }));

    expect(put).toHaveBeenCalledWith('/admin/companies/{companyId}/gsp-provider', {
      params: { path: { companyId: 'cmp_1' } },
      body: { provider: 'whitebooks', reason: 'Customer asked to move' },
    });
  });

  it('does not send a change to the gateway the company already files through', async () => {
    show(gsp());
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByRole('textbox'), 'No real change');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change gateway' }));

    expect(put).not.toHaveBeenCalled();
    expect((await within(dialog).findByRole('alert')).textContent).toContain('already files through Adaequare');
  });

  it('offers a gateway the deployment cannot run only as unavailable, with the reason', async () => {
    show(gsp({ options: [{ gateway: 'adaequare', available: true, sandboxOnly: false, reason: null }, { gateway: 'whitebooks', available: false, sandboxOnly: true, reason: 'Sandbox only here.' }] }));
    const dialog = await openDialog();
    const option = within(dialog).getByRole('option', { name: /Whitebooks/ }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain('not available');
  });
});
