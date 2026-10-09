import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReasonDialog } from './ReasonDialog';

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(<ReasonDialog open title="Suspend Acme" description="Signs everyone out." confirmLabel="Suspend" danger onConfirm={onConfirm} onClose={onClose} />);
  return { onConfirm, onClose, button: screen.getByRole('button', { name: 'Suspend' }), reason: screen.getByRole('textbox') };
}

describe('ReasonDialog', () => {
  it('needs a reason of at least three characters', async () => {
    const { button, reason } = setup();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(reason, '  ab  ');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(reason, 'c');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the trimmed reason and closes', async () => {
    const { button, reason, onConfirm, onClose } = setup();
    await userEvent.type(reason, '  Ticket #42  ');
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('Ticket #42');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the error and stays open when the action fails', async () => {
    const { button, reason, onClose } = setup(vi.fn().mockRejectedValue(new Error('This account is already suspended')));
    await userEvent.type(reason, 'Ticket #42');
    await userEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('This account is already suspended');
    expect(onClose).not.toHaveBeenCalled();
  });
});
