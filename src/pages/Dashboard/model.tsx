import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../../api';
import { useQuoteCountdown, useSession, useTransaction } from '../../hooks';
import { errorMessage } from '../../lib/format';
import type { Destination, DestinationsResponse, Quote, QuotesResponse } from '../../types';

export interface AmountType {
    value: 'NET' | 'GROSS';
    label: string;
    hint: string;
}

export const AMOUNT_TYPES: AmountType[] = [
    { value: 'NET', label: 'Net', hint: 'Fee is added on top. You send the full amount.' },
    { value: 'GROSS', label: 'Gross', hint: 'Fee is deducted from the amount you enter.' },
];

/**
 * Step 1 of the send flow: pick a destination and lock an FX rate
 * (POST /payout/quotes). The quote object is kept in context untouched.
 */
export function useDashboard() {
    const { user, hasProfile } = useSession();
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useTransaction();
    const quote = transactionData.quote;
    const countdown = useQuoteCountdown(quote);

    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [destError, setDestError] = useState<string | null>(null);
    const [loadingDest, setLoadingDest] = useState(true);
    const [countryCode, setCountryCode] = useState(transactionData.countryCode || '');
    const [amountValue, setAmountValue] = useState(quote?.sourceAmount?.amount ? String(Number(quote.sourceAmount.amount)) : '100');
    const [amountType, setAmountType] = useState<string>(quote?.amountType || 'NET');
    const [loading, setLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);

    const loadDestinations = useCallback(() => {
        request<DestinationsResponse>('get', '/destinations')
            .then((data) => {
                const list = Array.isArray(data) ? data : data.countryDestinations || [];
                setDestinations(list);
                setCountryCode((current) => (list.length && !list.some((d) => d.country === current) ? list[0].country ?? current : current));
            })
            .catch((err) => setDestError(errorMessage(err, 'Could not load destinations')))
            .finally(() => setLoadingDest(false));
    }, []);

    const retryDestinations = () => { setLoadingDest(true); setDestError(null); loadDestinations(); };

    useEffect(() => { loadDestinations(); }, [loadDestinations]);

    const destination = destinations.find((d) => d.country === countryCode);
    const currency = destination?.currency;

    // A new amount only invalidates the quote; a new country also invalidates beneficiary and account.
    const invalidate = () => setTransactionData((prev) => ({ ...prev, quote: null }));
    const invalidateCountry = () => setTransactionData((prev) => ({ ...prev, quote: null, beneficiary: null, account: null }));

    const onCountryChange = (value: string) => { setCountryCode(value); invalidateCountry(); };
    const onAmountChange = (value: string) => { setAmountValue(value); invalidate(); };
    const onAmountTypeChange = (value: AmountType['value']) => { setAmountType(value); invalidate(); };

    // Resume from the first step that has no data yet (the flow may have been started from the sidebar).
    const nextStep = !transactionData.beneficiary
        ? '/beneficiaries'
        : !transactionData.account
            ? `/beneficiaries/${transactionData.beneficiary.id}/account`
            : !transactionData.paymentMethod
                ? '/payment'
                : '/transaction/review';
    const nextLabel = !transactionData.beneficiary ? 'Choose beneficiary' : 'Continue';
    const goNext = () => navigate(nextStep, { state: { countryCode } });

    const handleGetQuote = async () => {
        if (!amountValue || !currency) return;
        setLoading(true);
        setQuoteError(null);
        try {
            const res = await request<QuotesResponse>('post', '/quotes', { fromCurrency: 'USD', toCurrency: currency, amount: amountValue, amountType });
            const body = res as { quotes?: Quote[] } & Partial<Quote>;
            const q: Quote | null = body.quotes ? body.quotes[0] : body.id ? (body as Quote) : null;
            if (!q) throw new Error('No quote returned for this corridor.');
            setTransactionData((prev) => ({ ...prev, quote: q, countryCode }));
        } catch (err) {
            setQuoteError(errorMessage(err, 'Failed to get a quote'));
        } finally {
            setLoading(false);
        }
    };

    const canProceed = !!quote && !countdown.expired && !loading;

    return {
        user, hasProfile, quote, countdown,
        destinations, destError, loadingDest, countryCode, amountValue, amountType, currency, loading, quoteError,
        retryDestinations, onCountryChange, onAmountChange, onAmountTypeChange, handleGetQuote, goNext,
        canProceed, nextLabel,
    };
}

export type DashboardViewProps = ReturnType<typeof useDashboard>;
