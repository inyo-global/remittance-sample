import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useQuoteCountdown from './useQuoteCountdown';

const T0 = new Date('2026-01-01T12:00:00Z').getTime();
const min = (n) => n * 60 * 1000;

describe('useQuoteCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('returns an idle state without a quote or expireAt', () => {
    const idle = { expired: false, warning: false, remainingMs: null, remainingLabel: null, progress: 0 };
    expect(renderHook(() => useQuoteCountdown(null)).result.current).toEqual(idle);
    expect(renderHook(() => useQuoteCountdown({ id: 'q' })).result.current).toEqual(idle);
  });

  it('formats the remaining time as m:ss and tracks progress', () => {
    const quote = { createdAt: new Date(T0).toISOString(), expireAt: new Date(T0 + min(10)).toISOString() };
    const { result } = renderHook(() => useQuoteCountdown(quote));
    expect(result.current.remainingLabel).toBe('10:00');
    expect(result.current.progress).toBe(0);
    expect(result.current.warning).toBe(false);
    act(() => { vi.advanceTimersByTime(min(2) + 5000); });
    expect(result.current.remainingLabel).toBe('7:55');
    expect(result.current.remainingMs).toBe(min(8) - 5000);
    expect(result.current.progress).toBeCloseTo(0.2083, 3);
  });

  it('warns once 80% of the window has elapsed and expires at the end', () => {
    const quote = { createdAt: new Date(T0).toISOString(), expireAt: new Date(T0 + min(10)).toISOString() };
    const { result } = renderHook(() => useQuoteCountdown(quote));
    act(() => { vi.advanceTimersByTime(min(8)); });
    expect(result.current.warning).toBe(true);
    expect(result.current.expired).toBe(false);
    expect(result.current.remainingLabel).toBe('2:00');
    act(() => { vi.advanceTimersByTime(min(2)); });
    expect(result.current.expired).toBe(true);
    expect(result.current.warning).toBe(false);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.remainingLabel).toBe('0:00');
    expect(result.current.progress).toBe(1);
  });

  it('assumes a 30 minute window when createdAt is missing', () => {
    const quote = { expireAt: new Date(T0 + min(15)).toISOString() };
    const { result } = renderHook(() => useQuoteCountdown(quote));
    // 15 of 30 minutes elapsed
    expect(result.current.progress).toBeCloseTo(0.5, 5);
    expect(result.current.remainingLabel).toBe('15:00');
  });

  it('stops ticking when unmounted', () => {
    const quote = { createdAt: new Date(T0).toISOString(), expireAt: new Date(T0 + min(1)).toISOString() };
    const { unmount } = renderHook(() => useQuoteCountdown(quote));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
