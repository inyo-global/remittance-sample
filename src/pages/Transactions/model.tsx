import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../lib/toast';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import type { Transaction, User } from '../../types';

export interface TransactionsProps {
    user?: User | null;
}

export function useTransactions({ user }: TransactionsProps) {
    const navigate = useNavigate();
    const toast = useToast();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        request<Transaction[]>('get', '/transactions')
            .then((data) => !cancelled && setTransactions(data))
            .catch((err) => !cancelled && setError(errorMessage(err)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [user?.userId]);

    // Polls GET /fx/transactions/{id} through the BFF (webhooks are the production path).
    const sync = async (e: MouseEvent<HTMLButtonElement>, txn: Transaction) => {
        e.stopPropagation();
        setSyncing(txn.id);
        try {
            const updated = await request<Transaction>('get', `/transactions/${txn.id}/sync`);
            setTransactions((list) => list.map((t) => (t.id === txn.id ? updated : t)));
            toast.success('Status refreshed', `${updated.data?.complianceStatus || ''} / ${updated.data?.payoutStatus || ''}`);
        } catch (err) {
            toast.error('Could not refresh status', errorMessage(err));
        } finally {
            setSyncing(null);
        }
    };

    const openReceipt = (txn: Transaction) => navigate('/transaction/receipt', { state: { transaction: txn, fromHistory: true } });

    return { transactions, loading, error, syncing, sync, openReceipt };
}

export type TransactionsViewProps = ReturnType<typeof useTransactions>;
