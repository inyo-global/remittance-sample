import React, { createContext, useState } from 'react';

export const TransactionContext = createContext();

export const TransactionProvider = ({ children }) => {
    const [transactionData, setTransactionData] = useState({
        amount: 0,
        currency: 'USD',
        quote: null,
        beneficiary: null,
        paymentMethod: null
    });

    return (
        <TransactionContext.Provider value={{ transactionData, setTransactionData }}>
            {children}
        </TransactionContext.Provider>
    );
};
