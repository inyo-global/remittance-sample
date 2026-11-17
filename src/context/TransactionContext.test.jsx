import React, { useContext } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { TransactionProvider } from './TransactionContext';
import { TransactionContext } from './transaction';

const EMPTY = { countryCode: null, quote: null, beneficiary: null, account: null, paymentMethod: null };
const wrapper = ({ children }) => <TransactionProvider>{children}</TransactionProvider>;

describe('TransactionProvider', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useContext(TransactionContext), { wrapper });
    expect(result.current.transactionData).toEqual(EMPTY);
  });

  it('updates with setTransactionData (value and updater) and resets', () => {
    const { result } = renderHook(() => useContext(TransactionContext), { wrapper });
    act(() => result.current.setTransactionData((prev) => ({ ...prev, quote: { id: 'q1' } })));
    expect(result.current.transactionData.quote).toEqual({ id: 'q1' });
    act(() => result.current.setTransactionData({ ...EMPTY, countryCode: 'BR' }));
    expect(result.current.transactionData).toEqual({ ...EMPTY, countryCode: 'BR' });
    act(() => result.current.resetTransaction());
    expect(result.current.transactionData).toEqual(EMPTY);
  });

  it('keeps a stable value while the data does not change', () => {
    const { result, rerender } = renderHook(() => useContext(TransactionContext), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    act(() => result.current.setTransactionData((p) => ({ ...p, countryCode: 'MX' })));
    expect(result.current).not.toBe(first);
    expect(result.current.resetTransaction).toBe(first.resetTransaction);
  });

  it('has no default value outside the provider', () => {
    const { result } = renderHook(() => useContext(TransactionContext));
    expect(result.current).toBeUndefined();
  });
});
