import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLoad } from './useLoad';

describe('useLoad', () => {
  it('loads once, exposes data and clears loading', async () => {
    const load = vi.fn().mockResolvedValue([1, 2]);
    const { result } = renderHook(() => useLoad(load, [], []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('turns a failure into a readable error with the fallback', async () => {
    const load = vi.fn().mockRejectedValue({ error: { source: 'local', message: 'nope' } });
    const { result } = renderHook(() => useLoad(load, null, [], 'Unavailable'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('nope');
    expect(result.current.data).toBeNull();
  });

  it('reloads on demand and when a dependency changes', async () => {
    const load = vi.fn().mockResolvedValue('ok');
    const { result, rerender } = renderHook(({ dep }) => useLoad(load, null, [dep]), { initialProps: { dep: 'a' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ dep: 'b' });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => { await result.current.reload(); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  });

  it('ignores a result that lands after unmount', async () => {
    let resolve;
    const load = vi.fn(() => new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useLoad(load, 'initial', []));
    unmount();
    await act(async () => { resolve('late'); });
    expect(result.current.data).toBe('initial');
  });
});
