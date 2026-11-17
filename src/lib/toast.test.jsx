import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContext, useToast } from './toast';
import { ToastProvider } from '../components/ui/Toast';

describe('useToast', () => {
  it('throws outside a ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used inside <ToastProvider>');
    spy.mockRestore();
  });

  it('returns the provided value', () => {
    const value = { info: vi.fn() };
    const wrapper = ({ children }) => <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current).toBe(value);
  });
});

function Trigger({ run }) {
  const toast = useToast();
  return <button type="button" onClick={() => run(toast)}>go</button>;
}

describe('ToastProvider', () => {
  it('renders pushed toasts with title and description and dismisses them', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger run={(t) => t.success('Saved', 'All good')} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('auto-dismisses after 5 s by default and 8 s for errors', () => {
    vi.useFakeTimers();
    let api;
    render(
      <ToastProvider>
        <Trigger run={(t) => { api = t; }} />
      </ToastProvider>,
    );
    act(() => { screen.getByRole('button', { name: 'go' }).click(); });
    act(() => { api.info('Info one'); api.error('Error one'); api.warning('Warn', undefined, { duration: 0 }); });
    expect(screen.getByText('Info one')).toBeInTheDocument();
    expect(screen.getByText('Error one')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText('Info one')).not.toBeInTheDocument();
    expect(screen.getByText('Error one')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('Error one')).not.toBeInTheDocument();
    // duration 0 never auto-dismisses
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.getByText('Warn')).toBeInTheDocument();
  });

  it('returns an id that dismiss() accepts', () => {
    let api;
    render(
      <ToastProvider>
        <Trigger run={(t) => { api = t; }} />
      </ToastProvider>,
    );
    act(() => { screen.getByRole('button', { name: 'go' }).click(); });
    let id;
    act(() => { id = api.info('Temp'); });
    expect(id).toEqual(expect.any(String));
    act(() => { api.dismiss(id); });
    expect(screen.queryByText('Temp')).not.toBeInTheDocument();
  });
});
