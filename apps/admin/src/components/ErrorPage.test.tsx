import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RootBoundary, RouteError } from './ErrorPage';

function Boom(): never {
  throw new Error('kaboom');
}

describe('error pages', () => {
  it('shows a way out instead of a blank page when a route throws', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }]);
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('alert').textContent).toContain('kaboom');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('catches what happens outside the router', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootBoundary>
        <Boom />
      </RootBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    quiet.mockRestore();
  });
});
