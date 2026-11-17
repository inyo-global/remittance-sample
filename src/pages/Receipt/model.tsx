import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../lib/toast';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import { isReversible } from '../../lib/status';
import type { Transaction, TransactionCreateResponse, TransactionData, TransactionHistoryRow } from '../../types';

/** The receipt shows either a stored row (from the history) or the POST /transactions response. */
type ReceiptTransaction = Transaction | TransactionCreateResponse;

interface ReceiptLocationState {
    transaction?: ReceiptTransaction;
    fromHistory?: boolean;
}

/**
 * Regulated receipt. Per the docs, exchange rate, fees, total, receive amount and
 * the `receipt` disclosures must be shown exactly as returned by the API.
 */
export function useReceipt() {
    const { state } = useLocation() as { state: ReceiptLocationState | null };
    const navigate = useNavigate();
    const toast = useToast();
    const [transaction, setTransaction] = useState<ReceiptTransaction | null>(state?.transaction || null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [history, setHistory] = useState<TransactionHistoryRow[] | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const localId = transaction?.id;
    const loadHistory = useCallback(async () => {
        if (!localId) return;
        setHistoryError(null);
        try {
            setHistory(await request<TransactionHistoryRow[]>('get', `/transactions/${localId}/status`));
        } catch (err) {
            setHistoryError(errorMessage(err, 'Could not load the status history'));
        }
    }, [localId]);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    useEffect(() => {
        if (!state?.transaction) {
            navigate('/transactions', { replace: true });
            return;
        }
        // The POST response is already complete; for history rows re-read the stored copy.
        if (state.fromHistory) return;
        const wanted = state.transaction;
        let cancelled = false;
        setLoading(true);
        request<Transaction[]>('get', '/transactions')
            .then((list) => {
                const match = list.find((t) => t.id === wanted.id || t.externalId === wanted.id);
                if (match && !cancelled) setTransaction(match);
            })
            .catch(() => {})
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [state, navigate]);

    // A stored row keeps the Inyo payload under `data`; the POST response is the payload itself.
    const tx = (transaction ? ('data' in transaction && transaction.data ? { ...transaction.data } : transaction) : {}) as TransactionData;
    const receipt: NonNullable<TransactionData['receipt']> = tx.receipt || {};
    const fx: NonNullable<TransactionData['destinationExchangeRate']> = tx.destinationExchangeRate || {};
    const nested = typeof tx.status === 'object' && tx.status ? tx.status : undefined;
    const complianceStatus = tx.complianceStatus || nested?.complianceStatus;
    const payoutStatus = tx.payoutStatus || nested?.payoutStatus || (typeof transaction?.status === 'string' ? transaction.status : undefined);
    const paymentStatus = tx.paymentStatus;
    const row = (transaction || {}) as Partial<Transaction>;
    const reversible = !!transaction && isReversible(transaction);

    const sync = async () => {
        if (!transaction) return;
        setSyncing(true);
        try {
            const updated = await request<Transaction>('get', `/transactions/${transaction.id}/sync`);
            setTransaction(updated);
            await loadHistory();
            toast.success('Status refreshed');
        } catch (err) {
            toast.error('Could not refresh status', errorMessage(err));
        } finally {
            setSyncing(false);
        }
    };

    // PUT /fx/transactions/{id}/status/cancel: Inyo voids or refunds depending on how far the
    // payment went. 204 queues the reversal (CancelRequested); 422 means it is no longer reversible.
    const cancel = async () => {
        if (!transaction) return;
        if (!window.confirm('Cancel this transfer? Inyo will void the authorisation or refund the payment. This cannot be undone.')) return;
        setCancelling(true);
        try {
            const updated = await request<Transaction>('post', `/transactions/${transaction.id}/cancel`);
            setTransaction(updated);
            await loadHistory();
            toast.success('Cancellation requested', 'The reversal is processed asynchronously. Refresh in a moment to see Cancelled or Refunded.');
        } catch (err) {
            toast.error('Could not cancel', errorMessage(err));
        } finally {
            setCancelling(false);
        }
    };

    const print = () => window.print();

    return {
        fromHistory: !!state?.fromHistory,
        transaction, loading, syncing, cancelling, history, historyError,
        tx, receipt, fx, complianceStatus, payoutStatus, paymentStatus, row, reversible,
        loadHistory, sync, cancel, print,
    };
}

export type ReceiptViewProps = ReturnType<typeof useReceipt>;
