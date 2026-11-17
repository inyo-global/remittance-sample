import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../../api';
import { useTransaction } from '../../hooks';
import { useQuoteCountdown } from '../../hooks';
import { errorMessage } from '../../lib/format';
import type { PayoutMethod, TransactionCreateResponse } from '../../types';

/**
 * Step 5: review and POST /fx/transactions. All money values come from the quote
 * (sourceAmount, fee, totalCost, destinationAmount); nothing is recomputed here.
 */
export function useReviewTransaction() {
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useTransaction();
    const { beneficiary, account, paymentMethod, quote } = transactionData;
    const countdown = useQuoteCountdown(quote);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const missing = [!quote && 'a quote', !beneficiary && 'a beneficiary', !account && 'a delivery account', !paymentMethod && 'a payment method'].filter(Boolean);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await request<TransactionCreateResponse>('post', '/transactions', {
                beneficiaryId: beneficiary!.id,
                accountId: account!.id,
                paymentMethodId: paymentMethod!.id,
                quoteId: quote!.id || quote!.quoteId,
            });
            if (!res.id) throw new Error('The API did not return a transaction id.');
            setTransactionData((prev) => ({ ...prev, quote: null, beneficiary: null, account: null, paymentMethod: null }));
            navigate('/transaction/receipt', { state: { transaction: res }, replace: true });
        } catch (err) {
            setError(errorMessage(err, 'Transaction failed'));
        } finally {
            setLoading(false);
        }
    };

    const goTo = (path: string) => navigate(path);

    const pm: PayoutMethod = account?.data?.payoutMethod || {};
    const beneficiaryName = beneficiary ? beneficiary.nickname || [beneficiary.data?.firstName, beneficiary.data?.lastName].filter(Boolean).join(' ') : '';

    return { quote, beneficiary, account, paymentMethod, countdown, loading, error, missing, pm, beneficiaryName, handleConfirm, goTo };
}

export type ReviewTransactionViewProps = ReturnType<typeof useReviewTransaction>;
