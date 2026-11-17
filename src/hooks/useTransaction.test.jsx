import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { TransactionProvider } from '../context/TransactionContext';
import { useTransaction } from './useTransaction';

describe('useTransaction', () => {
  it('throws outside <TransactionProvider>', () => {
    expect(() => renderHook(() => useTransaction())).toThrow(/inside <TransactionProvider>/);
  });

  it('returns the draft and its setters inside the provider', () => {
    const wrapper = ({ children }) => <TransactionProvider>{children}</TransactionProvider>;
    const { result } = renderHook(() => useTransaction(), { wrapper });
    expect(result.current.transactionData).toMatchObject({ quote: null, beneficiary: null });
    expect(typeof result.current.setTransactionData).toBe('function');
    expect(typeof result.current.resetTransaction).toBe('function');
  });
});
