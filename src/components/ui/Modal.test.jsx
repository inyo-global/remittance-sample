import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal open={false} title="Hidden">content</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a labelled dialog with title, description and children', () => {
    render(<Modal open title="Confirm" description="Are you sure?">body</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Confirm');
    expect(screen.getByRole('heading', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(dialog.querySelector('.max-w-lg')).not.toBeNull();
  });

  it('uses a wider panel for size=lg', () => {
    render(<Modal open title="Wide" size="lg">x</Modal>);
    expect(screen.getByRole('dialog').querySelector('.max-w-3xl')).not.toBeNull();
  });

  it('calls onClose from the close button, the backdrop and Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose}>x</Modal>);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('dialog').firstChild);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('locks body scrolling while open and restores it on close', () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = render(<Modal open title="T">x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Modal open={false} title="T">x</Modal>);
    expect(document.body.style.overflow).toBe('auto');
    rerender(<Modal open title="T">x</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('tolerates a missing onClose on Escape', () => {
    render(<Modal open title="T">x</Modal>);
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();
  });
});
