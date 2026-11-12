import React, { useCallback, useMemo, useState } from 'react';
import { TransactionContext } from './transaction';

const EMPTY = {
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
export const TransactionProvider = ({ children }) => {
    const [transactionData, setTransactionData] = useState(EMPTY);
    const resetTransaction = useCallback(() => setTransactionData(EMPTY), []);

    const value = useMemo(() => ({ transactionData, setTransactionData, resetTransaction }), [transactionData, resetTransaction]);

    return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
};
