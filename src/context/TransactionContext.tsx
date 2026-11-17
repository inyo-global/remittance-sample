import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { TransactionContext } from './transaction';
import type { TransactionDraft } from '../types';

const EMPTY: TransactionDraft = {
    countryCode: null,
    quote: null,
    beneficiary: null,
    account: null,
    paymentMethod: null,
};

/**
 * Holds the in-progress "send money" flow:
 * amount/quote -> beneficiary -> beneficiary account -> funding account -> review.
 */
export const TransactionProvider = ({ children }: { children: ReactNode }) => {
    const [transactionData, setTransactionData] = useState<TransactionDraft>(EMPTY);
    const resetTransaction = useCallback(() => setTransactionData(EMPTY), []);

    const value = useMemo(() => ({ transactionData, setTransactionData, resetTransaction }), [transactionData, resetTransaction]);

    return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
};
