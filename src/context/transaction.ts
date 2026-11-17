import { createContext, type Dispatch, type SetStateAction } from 'react';
import type { TransactionDraft } from '../types';

export interface TransactionContextValue {
    transactionData: TransactionDraft;
    setTransactionData: Dispatch<SetStateAction<TransactionDraft>>;
    resetTransaction: () => void;
}

export const TransactionContext = createContext<TransactionContextValue | undefined>(undefined);
