import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider } from './Toast';
import { useToast } from '../../hooks/useToast';

function Grab({ onReady }) {
  const toast = useToast();
  React.useEffect(() => { onReady(toast); }, [toast, onReady]);
  return null;
}

describe('ToastProvider rendering', () => {
  it('renders each tone with its icon colour inside a polite live region', () => {
    let api;
    const { container } = render(
      <ToastProvider>
        <Grab onReady={(t) => { api = t; }} />
      </ToastProvider>,
    );
    act(() => {
      api.info('I', 'info body');
      api.success('S');
      api.warning('W');
      api.error('E');
    });
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region.querySelectorAll('.text-info-600')).toHaveLength(1);
    expect(region.querySelectorAll('.text-success-600')).toHaveLength(1);
    expect(region.querySelectorAll('.text-warning-600')).toHaveLength(1);
    expect(region.querySelectorAll('.text-danger-600')).toHaveLength(1);
    expect(screen.getByText('info body')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(4);
  });

  it('exposes a stable api object across renders', () => {
    const seen = [];
    const { rerender } = render(
      <ToastProvider>
        <Grab onReady={(t) => seen.push(t)} />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <Grab onReady={(t) => seen.push(t)} />
      </ToastProvider>,
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(1);
    expect(Object.keys(seen[0]).sort()).toEqual(['dismiss', 'error', 'info', 'success', 'warning']);
  });
});
