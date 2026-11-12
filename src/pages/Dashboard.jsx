import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import PageHeader from '../components/ui/PageHeader';
import { request } from '../api';
import { TransactionContext } from '../context/transaction';
import useQuoteCountdown from '../lib/useQuoteCountdown';
import { amount, errorMessage, money, rate } from '../lib/format';
import { cx } from '../lib/cx';

const AMOUNT_TYPES = [
    { value: 'NET', label: 'Net', hint: 'Fee is added on top. You send the full amount.' },
    { value: 'GROSS', label: 'Gross', hint: 'Fee is deducted from the amount you enter.' },
];

/**
 * Step 1 of the send flow: pick a destination and lock an FX rate
 * (POST /payout/quotes). The quote object is kept in context untouched.
 */
const Dashboard = ({ user, hasProfile }) => {
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useContext(TransactionContext);
    const quote = transactionData.quote;
    const countdown = useQuoteCountdown(quote);

    const [destinations, setDestinations] = useState([]);
    const [destError, setDestError] = useState(null);
    const [loadingDest, setLoadingDest] = useState(true);
    const [countryCode, setCountryCode] = useState(transactionData.countryCode || '');
    const [amountValue, setAmountValue] = useState(quote?.sourceAmount?.amount ? String(Number(quote.sourceAmount.amount)) : '100');
    const [amountType, setAmountType] = useState(quote?.amountType || 'NET');
    const [loading, setLoading] = useState(false);
    const [quoteError, setQuoteError] = useState(null);

    const loadDestinations = useCallback(() => {
        request('get', '/destinations')
            .then((data) => {
                const list = data.countryDestinations || (Array.isArray(data) ? data : []);
                setDestinations(list);
                setCountryCode((current) => (list.length && !list.some((d) => d.country === current) ? list[0].country : current));
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

    // Resume from the first step that has no data yet (the flow may have been started from the sidebar).
    const nextStep = !transactionData.beneficiary
        ? '/beneficiaries'
        : !transactionData.account
            ? `/beneficiaries/${transactionData.beneficiary.id}/account`
            : !transactionData.paymentMethod
                ? '/payment'
                : '/transaction/review';
    const nextLabel = !transactionData.beneficiary ? 'Choose beneficiary' : 'Continue';

    const handleGetQuote = async () => {
        if (!amountValue || !currency) return;
        setLoading(true);
        setQuoteError(null);
        try {
            const res = await request('post', '/quotes', { fromCurrency: 'USD', toCurrency: currency, amount: amountValue, amountType });
            const q = res.quotes ? res.quotes[0] : res.id ? res : null;
            if (!q) throw new Error('No quote returned for this corridor.');
            setTransactionData((prev) => ({ ...prev, quote: q, countryCode }));
        } catch (err) {
            setQuoteError(errorMessage(err, 'Failed to get a quote'));
        } finally {
            setLoading(false);
        }
    };

    const canProceed = !!quote && !countdown.expired && !loading;

    return (
        <div>
            <PageHeader
                kicker={`Hi ${user?.firstName || 'there'}`}
                title="Send money"
                description="Pick a destination, enter an amount and lock today's rate."
            />

            {!hasProfile && (
                <Alert tone="warning" className="mb-6" title="Your sender profile is incomplete" action={<Button as={Link} to="/profile" size="sm" variant="secondary">Complete profile</Button>}>
                    Inyo requires a verified sender (compliance level 1) before a transaction can be created.
                </Alert>
            )}

            {destError && (
                <Alert tone="danger" className="mb-6" title="Destinations unavailable" action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={retryDestinations}>Retry</Button>}>
                    {destError}
                </Alert>
            )}

            <Card>
                <CardBody className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Destination country"
                            name="country"
                            value={countryCode}
                            onChange={(e) => { setCountryCode(e.target.value); invalidateCountry(); }}
                            options={destinations.map((d) => ({ value: d.country, label: `${d.emoji ? `${d.emoji} ` : ''}${d.countryName} (${d.currency})` }))}
                            placeholder={loadingDest ? 'Loading destinations…' : 'Select a country'}
                            disabled={loadingDest || !destinations.length}
                            required
                        />
                        <Field
                            label="You send"
                            name="amount"
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="0.01"
                            value={amountValue}
                            onChange={(e) => { setAmountValue(e.target.value); invalidate(); }}
                            suffix="USD"
                            required
                        />
                    </div>

                    <div>
                        <p className="mb-1.5 text-sm font-medium text-ink-700">Fee handling</p>
                        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Amount type">
                            {AMOUNT_TYPES.map((t) => {
                                const active = amountType === t.value;
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => { setAmountType(t.value); invalidate(); }}
                                        className={cx(
                                            'rounded-xl border px-4 py-3 text-left transition-all',
                                            active ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-500/10' : 'border-ink-200 bg-white hover:border-ink-300',
                                        )}
                                    >
                                        <p className={cx('text-sm font-semibold', active ? 'text-brand-700' : 'text-ink-800')}>{t.label} <span className="font-mono text-[11px] font-medium text-ink-400">{t.value}</span></p>
                                        <p className="mt-0.5 text-xs text-ink-500">{t.hint}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {quoteError && <Alert tone="danger">{quoteError}</Alert>}

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-ink-400">Quotes are not cached and expire. The rate shown is the one applied to the transaction.</p>
                        <Button onClick={handleGetQuote} loading={loading} disabled={!amountValue || !currency} variant={quote ? 'secondary' : 'primary'} icon={quote ? RefreshCw : Sparkles}>
                            {quote ? 'Refresh quote' : 'Get quote'}
                        </Button>
                    </div>
                </CardBody>
            </Card>

            {quote && (
                <Card className="mt-6 overflow-hidden animate-fade-up">
                    <div className="grid sm:grid-cols-[1.2fr_1fr]">
                        <div className="bg-gradient-to-br from-ink-900 to-ink-800 p-6 text-white">
                            <p className="kicker text-ink-400">Beneficiary receives</p>
                            <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight">{amount(quote.destinationAmount?.amount, quote.destinationAmount?.currency)}</p>
                            <p className="mt-2 text-sm text-ink-300">{rate(quote.effectiveRate, quote.sourceAmount?.currency, quote.destinationAmount?.currency)}</p>
                            <div
                                className={cx(
                                    'mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold',
                                    countdown.expired ? 'bg-danger-500/20 text-danger-100' : countdown.warning ? 'bg-warning-500/20 text-warning-100' : 'bg-white/10 text-ink-200',
                                )}
                            >
                                <Clock className="size-3.5" />
                                {countdown.expired ? 'Quote expired' : `Rate locked for ${countdown.remainingLabel}`}
                            </div>
                        </div>
                        <div className="p-6">
                            <dl className="divide-y divide-ink-100 text-sm">
                                <div className="flex justify-between py-2"><dt className="text-ink-500">You send</dt><dd className="font-semibold tabular-nums">{money(quote.sourceAmount?.amount, quote.sourceAmount?.currency)}</dd></div>
                                <div className="flex justify-between py-2"><dt className="text-ink-500">Transfer fee</dt><dd className="font-semibold tabular-nums">{money(quote.fee?.amount, quote.fee?.currency)}</dd></div>
                                <div className="flex justify-between py-2"><dt className="font-semibold text-ink-900">Total to pay</dt><dd className="text-base font-bold tabular-nums text-ink-900">{money(quote.totalCost?.amount, quote.totalCost?.currency)}</dd></div>
                            </dl>
                            <Button className="mt-5 w-full" size="lg" iconRight={ArrowRight} disabled={!canProceed} onClick={() => navigate(nextStep, { state: { countryCode } })}>
                                {nextLabel}
                            </Button>
                            {countdown.expired && <p className="mt-2 text-center text-xs text-danger-600">This quote expired. Refresh it to continue.</p>}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default Dashboard;
