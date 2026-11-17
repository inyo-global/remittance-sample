import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useRouteState } from './useRouteState';

const withRoute = (state) => ({ children }) => <MemoryRouter initialEntries={[{ pathname: '/x', state }]}>{children}</MemoryRouter>;

describe('useRouteState', () => {
  it('returns the navigation state', () => {
    const { result } = renderHook(() => useRouteState(), { wrapper: withRoute({ countryCode: 'BR' }) });
    expect(result.current).toEqual({ countryCode: 'BR' });
  });

  it('returns null when there is no state', () => {
    const { result } = renderHook(() => useRouteState(), { wrapper: withRoute(undefined) });
    expect(result.current).toBeNull();
  });
});
