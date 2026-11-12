import React, { useContext } from 'react';
import { ArrowLeftRight, Clock, CreditCard, Landmark, UserRound } from 'lucide-react';
import { TransactionContext } from '../context/transaction';
import useQuoteCountdown from '../lib/useQuoteCountdown';
import { amount, money, rate } from '../lib/format';
import { cx } from '../lib/cx';

function Row({ label, value, strong }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm text-ink-500">{label}</span>
            <span className={cx('text-right text-sm tabular-nums', strong ? 'text-base font-bold text-ink-900' : 'font-semibold text-ink-800')}>{value}</span>
        </div>
    );
}

function Selection({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-3 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                <Icon className="size-4" />
            </div>
            <div className="min-w-0">
                <p className="kicker">{label}</p>
                <p className="truncate text-sm font-medium text-ink-800">{value}</p>
            </div>
        </div>
    );
}

/**
 * Sticky summary shown during the send flow. Everything here comes from the
 * quote object as returned by POST /payout/quotes (never recomputed client-side).
 */
export default function TransferPanel() {
    const { transactionData } = useContext(TransactionContext);
    const { quote, beneficiary, account, paymentMethod } = transactionData;
    const countdown = useQuoteCountdown(quote);

    const src = quote?.sourceAmount;
    const dst = quote?.destinationAmount;

    return (
        <aside className="card sticky top-6 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/70 px-5 py-3.5">
                <ArrowLeftRight className="size-4 text-brand-600" />
                <h2 className="text-sm font-semibold text-ink-900">Transfer summary</h2>
            </div>

            <div className="px-5 py-4">
                {quote ? (
                    <>
                        <div className="mb-4 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-100">Beneficiary receives</p>
                            <p className="mt-1 text-2xl font-bold tabular-nums">{amount(dst?.amount, dst?.currency)}</p>
                            <p className="mt-1 text-xs text-brand-100">{rate(quote.effectiveRate, src?.currency, dst?.currency)}</p>
                        </div>

                        <div className="divide-y divide-ink-100">
                            <Row label="You send" value={money(src?.amount, src?.currency)} />
                            <Row label="Fee" value={money(quote.fee?.amount, quote.fee?.currency)} />
                            <Row label="Total to pay" value={money(quote.totalCost?.amount, quote.totalCost?.currency)} strong />
                        </div>

                        {quote.expireAt && (
                            <div
                                className={cx(
                                    'mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                                    countdown.expired ? 'bg-danger-50 text-danger-700' : countdown.warning ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600',
                                )}
                            >
                                <Clock className="size-3.5" />
                                {countdown.expired ? 'Rate expired. Request a new quote.' : `Rate locked for ${countdown.remainingLabel}`}
                            </div>
                        )}
                    </>
                ) : (
                    <p className="py-2 text-sm text-ink-500">Enter an amount and request a quote to lock an exchange rate.</p>
                )}

                {(beneficiary || account || paymentMethod) && (
                    <div className="mt-4 divide-y divide-ink-100 border-t border-ink-100 pt-2">
                        {beneficiary && <Selection icon={UserRound} label="Beneficiary" value={beneficiary.nickname || `${beneficiary.data?.firstName || ''} ${beneficiary.data?.lastName || ''}`} />}
                        {account && <Selection icon={Landmark} label="Delivery" value={`${account.data?.payoutMethod?.type || 'Account'} · ${account.data?.payoutMethod?.bankCode || account.data?.payoutMethod?.keyType || ''} ${(account.data?.payoutMethod?.accountNumber || account.data?.payoutMethod?.key || '').slice(-4)}`} />}
                        {paymentMethod && (
                            <Selection
                                icon={CreditCard}
                                label="Pay with"
                                value={paymentMethod.type === 'ACH' ? paymentMethod.data?.apiResponse?.bankName || paymentMethod.token?.nickname || 'Bank account' : `${paymentMethod.token?.schemeId || 'Card'} ···· ${paymentMethod.token?.lastFourDigits || ''}`}
                            />
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}
