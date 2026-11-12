import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CreditCard, Landmark, Lock, Pencil, UserRound } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { request } from '../api';
import { TransactionContext } from '../context/transaction';
import useQuoteCountdown from '../lib/useQuoteCountdown';
import { amount, errorMessage, humanize, maskAccount, money, rate } from '../lib/format';
import { methodSubtitle, methodTitle } from '../lib/paymentMethods';
import { cx } from '../lib/cx';

function Section({ icon: Icon, label, title, subtitle, editTo }) {
    const navigate = useNavigate();
    return (
        <div className="flex items-center gap-4 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="kicker">{label}</p>
                <p className="truncate font-semibold text-ink-900">{title}</p>
                {subtitle && <p className="truncate text-sm text-ink-500">{subtitle}</p>}
            </div>
            <button type="button" onClick={() => navigate(editTo)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                <Pencil className="size-3" /> Change
            </button>
        </div>
    );
}

/**
 * Step 5: review and POST /fx/transactions. All money values come from the quote
 * (sourceAmount, fee, totalCost, destinationAmount); nothing is recomputed here.
 */
const ReviewTransaction = () => {
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useContext(TransactionContext);
    const { beneficiary, account, paymentMethod, quote } = transactionData;
    const countdown = useQuoteCountdown(quote);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const missing = [!quote && 'a quote', !beneficiary && 'a beneficiary', !account && 'a delivery account', !paymentMethod && 'a payment method'].filter(Boolean);

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await request('post', '/transactions', {
                beneficiaryId: beneficiary.id,
                accountId: account.id,
                paymentMethodId: paymentMethod.id,
                quoteId: quote.id || quote.quoteId,
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

    if (missing.length) {
        return (
            <div>
                <PageHeader kicker="Step 5 of 5" title="Review" />
                <Alert
                    tone="warning"
                    title="This transfer is incomplete"
                    action={<Button as={Link} to={!quote ? '/dashboard' : !beneficiary ? '/beneficiaries' : !account ? `/beneficiaries/${beneficiary.id}/account` : '/payment'} size="sm" variant="secondary">{!quote ? 'Lock a quote' : 'Complete step'}</Button>}
                >
                    Missing {missing.join(', ')}. {!quote ? 'Lock a quote on the Amount step; your beneficiary and payment selections are kept.' : 'Go back through the steps to complete it.'}
                </Alert>
            </div>
        );
    }

    const pm = account.data?.payoutMethod || {};
    const beneficiaryName = beneficiary.nickname || [beneficiary.data?.firstName, beneficiary.data?.lastName].filter(Boolean).join(' ');

    return (
        <div>
            <PageHeader kicker="Step 5 of 5" title="Review your transfer" description="Check everything before we submit it to Inyo. The locked rate and fee below are exactly what will be charged." />

            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                <Card>
                    <CardBody className="divide-y divide-ink-100 py-1">
                        <Section icon={UserRound} label="Beneficiary" title={beneficiaryName} subtitle={beneficiary.data?.address?.countryCode || beneficiary.data?.documents?.[0]?.countryCode} editTo="/beneficiaries" />
                        <Section
                            icon={Landmark}
                            label="Delivery"
                            title={pm.type === 'PIX' ? `PIX · ${pm.keyType || ''}` : `${humanize(pm.type || 'BANK_DEPOSIT')}${pm.bankCode ? ` · ${pm.bankCode}` : ''}`}
                            subtitle={pm.type === 'PIX' ? pm.key : `${pm.accountType || ''} ${maskAccount(pm.accountNumber || pm.walletId)} · ${account.data?.asset || ''}`}
                            editTo={`/beneficiaries/${beneficiary.id}/account`}
                        />
                        <Section icon={CreditCard} label="Pay with" title={methodTitle(paymentMethod)} subtitle={methodSubtitle(paymentMethod)} editTo="/payment" />
                    </CardBody>
                </Card>

                <Card className="overflow-hidden">
                    <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
                        <p className="kicker text-brand-100">Beneficiary receives</p>
                        <p className="mt-1 text-3xl font-bold tabular-nums">{amount(quote.destinationAmount?.amount, quote.destinationAmount?.currency)}</p>
                        <p className="mt-1 text-sm text-brand-100">{rate(quote.effectiveRate, quote.sourceAmount?.currency, quote.destinationAmount?.currency)}</p>
                    </div>
                    <CardBody>
                        <dl className="divide-y divide-ink-100 text-sm">
                            <div className="flex justify-between py-2.5"><dt className="text-ink-500">You send</dt><dd className="font-semibold tabular-nums">{money(quote.sourceAmount?.amount, quote.sourceAmount?.currency)}</dd></div>
                            <div className="flex justify-between py-2.5"><dt className="text-ink-500">Transfer fee</dt><dd className="font-semibold tabular-nums">{money(quote.fee?.amount, quote.fee?.currency)}</dd></div>
                            <div className="flex justify-between py-2.5"><dt className="text-ink-500">Amount type</dt><dd className="font-mono text-xs font-semibold text-ink-700">{quote.amountType || 'NET'}</dd></div>
                            <div className="flex justify-between py-3"><dt className="text-base font-bold text-ink-900">Total to pay</dt><dd className="text-xl font-bold tabular-nums text-ink-900">{money(quote.totalCost?.amount, quote.totalCost?.currency)}</dd></div>
                        </dl>
                        <div className={cx('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium', countdown.expired ? 'bg-danger-50 text-danger-700' : countdown.warning ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600')}>
                            <Clock className="size-3.5" />
                            {countdown.expired ? 'This quote expired. Get a new one.' : `Rate locked for ${countdown.remainingLabel}`}
                        </div>
                        {error && <Alert tone="danger" className="mt-4" title="Transaction not created">{error}</Alert>}
                    </CardBody>
                    <CardFooter>
                        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/payment')}>Back</Button>
                        {countdown.expired ? (
                            <Button as={Link} to="/dashboard" variant="secondary">Refresh quote</Button>
                        ) : (
                            <Button variant="success" icon={Lock} loading={loading} onClick={handleConfirm}>Confirm and send</Button>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default ReviewTransaction;
