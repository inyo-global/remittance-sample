import { useContext } from 'react';
import { TransactionContext, type TransactionContextValue } from '../context/transaction';

/** The in-progress send-money flow. Throws outside <TransactionProvider>, like useToast. */
export function useTransaction(): TransactionContextValue {
    const ctx = useContext(TransactionContext);
    if (!ctx) throw new Error('useTransaction must be used inside <TransactionProvider>');
    return ctx;
}
