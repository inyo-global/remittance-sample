import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Ban, CheckCircle2, History, Printer, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import { amount, dateTime, money, rate } from '../../lib/format';
import { TONE_DOT, TONE_TEXT, complianceTone, historyTone, payoutTone } from '../../lib/status';
import logo from '../../assets/inyo-logo.png';
import type { TransactionHistoryRow } from '../../types';
import type { ReceiptViewProps } from './model';

function Line({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-sm text-ink-500">{label}</dt>
            <dd className={strong ? 'text-base font-bold tabular-nums text-ink-900' : 'text-sm font-semibold tabular-nums text-ink-900'}>{value}</dd>
        </div>
    );
}

/**
 * Status history from GET /fx/transactions/{id}/status (most recent first). Each row carries the
 * compliance/payout pair plus the system messages that explain the change; the fine-grained
 * statuses (PaymentAuthorized, WaitingPayout, ...) only arrive through webhooks.
 */
function StatusTimeline({ history, loading, error }: { history: TransactionHistoryRow[] | null; loading: boolean; error: string | null }) {
    if (loading) return <Spinner label="Loading status history…" />;
    if (error) return <Alert tone="danger">{error}</Alert>;
    if (!history?.length) return <p className="text-sm text-ink-500">No status changes recorded yet.</p>;
    return (
        <ol className="relative ml-2 border-l border-ink-200 pl-6">
            {history.map((row, i) => {
                const tone = historyTone(row);
                return (
                    <li key={row.id || i} className="relative pb-5 last:pb-0">
                        <span className={`absolute -left-[31px] top-1 flex size-2.5 rounded-full ring-4 ring-white ${TONE_DOT[tone]}`} aria-hidden />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Badge tone={tone}>{row.payoutStatus || '—'}</Badge>
                            <span className="text-xs text-ink-500">Compliance: <span className={`font-medium ${TONE_TEXT[complianceTone(row.complianceStatus)]}`}>{row.complianceStatus || '—'}</span></span>
                            <span className="text-xs text-ink-400">{dateTime(row.createdAt)}</span>
                        </div>
                        {row.messages && row.messages.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                                {row.messages.map((m) => (
                                    <li key={m.id} className="text-sm text-ink-700">
                                        {m.message}
                                        {m.createdBy && <span className="ml-1 text-xs text-ink-400">· {m.createdBy}{m.type ? ` · ${m.type}` : ''}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

export default function ReceiptView({
    fromHistory, transaction, loading, syncing, cancelling, history, historyError,
    tx, receipt, fx, complianceStatus, payoutStatus, paymentStatus, row, reversible,
    loadHistory, sync, cancel, print,
}: ReceiptViewProps) {
    if (!transaction) return null;
    if (loading) return <Spinner label="Preparing receipt…" />;

    return (
        <div className="mx-auto max-w-3xl">
            <div className="print-hidden mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-success-50 text-success-600">
                        <CheckCircle2 className="size-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-ink-900">{fromHistory ? 'Transaction receipt' : 'Transfer submitted'}</h1>
                        <p className="text-sm text-ink-500">Inyo is processing the payment and payout.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={RefreshCw} loading={syncing} onClick={sync}>Refresh status</Button>
                    {reversible && (
                        <Button variant="danger" size="sm" icon={Ban} loading={cancelling} onClick={cancel}>Cancel transfer</Button>
                    )}
                    <Button variant="secondary" size="sm" icon={Printer} onClick={print}>Print</Button>
                </div>
            </div>

            {paymentStatus === 'ActionRequired' && (
                <Alert tone="warning" className="print-hidden mb-6" title="3D Secure verification required">
                    The card issuer requires a challenge before the payment can be captured. This transaction stays in WaitingChallenge3ds until it completes.
                </Alert>
            )}

            <Card className="overflow-hidden print:border-0 print:shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 px-6 py-5 sm:px-8">
                    <div>
                        <img src={logo} alt="Inyo" className="h-6" />
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">Transmission order</p>
                        <p className="font-mono text-sm font-semibold text-ink-900">{tx.id || row.externalId}</p>
                    </div>
                    <div className="text-right text-sm">
                        <p className="text-ink-500">{dateTime(tx.createdAt || row.createdAt, { timeZone: 'America/New_York' })} (ET)</p>
                        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                            {complianceStatus && <Badge tone={complianceTone(complianceStatus)}>Compliance: {complianceStatus}</Badge>}
                            {payoutStatus && <Badge tone={payoutTone(payoutStatus)}>Payout: {payoutStatus}</Badge>}
                        </div>
                    </div>
                </div>

                <div className="grid gap-8 px-6 py-6 sm:px-8 md:grid-cols-2">
                    <section>
                        <p className="kicker mb-2">Financial summary</p>
                        <dl className="divide-y divide-ink-100">
                            <Line label="Amount sent" value={money(tx.anchorCurrencyAmount?.amount ?? tx.conversionAmount?.amount, tx.anchorCurrencyAmount?.currency || tx.totalAmount?.currency)} />
                            <Line label="Transfer fee" value={money(tx.fee?.amount, tx.fee?.currency)} />
                            <Line label="Total paid" value={money(tx.totalAmount?.amount, tx.totalAmount?.currency)} strong />
                            <Line label="Exchange rate" value={rate(fx.rate || tx.exchangeRate, fx.fromCurrency || tx.totalAmount?.currency, fx.toCurrency || tx.receivingAmount?.currency)} />
                            <Line label="Beneficiary receives" value={amount(tx.receivingAmount?.amount, tx.receivingAmount?.currency)} strong />
                        </dl>
                    </section>

                    <section className="space-y-5">
                        <div>
                            <p className="kicker mb-2">Sender</p>
                            <p className="font-semibold text-ink-900">{tx.sender?.name || '—'}</p>
                            {tx.sender?.phoneNumber && <p className="text-sm text-ink-500">{tx.sender.phoneNumber}</p>}
                        </div>
                        <div>
                            <p className="kicker mb-2">Beneficiary</p>
                            <p className="font-semibold text-ink-900">{tx.recipient?.name || row.recipientName || '—'}</p>
                            {tx.recipient?.phoneNumber && <p className="text-sm text-ink-500">{tx.recipient.phoneNumber}</p>}
                        </div>
                        {receipt.license && (
                            <div>
                                <p className="kicker mb-2">License</p>
                                <p className="font-mono text-sm text-ink-700">{receipt.license}</p>
                            </div>
                        )}
                    </section>
                </div>

                {(receipt.contactInfo || receipt.rightToRefund || receipt.cancellationDisclosure) && (
                    <div className="space-y-3 border-t border-ink-100 bg-ink-50/60 px-6 py-5 text-[11.5px] leading-relaxed text-ink-600 sm:px-8">
                        {receipt.contactInfo && <p>{receipt.contactInfo}</p>}
                        {receipt.rightToRefund && <p><span className="font-semibold text-ink-800">Right to refund. </span>{receipt.rightToRefund}</p>}
                        {receipt.cancellationDisclosure && <p><span className="font-semibold text-ink-800">Cancellation. </span>{receipt.cancellationDisclosure}</p>}
                    </div>
                )}
            </Card>

            <Card className="print-hidden mt-6 px-6 py-5 sm:px-8">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="kicker">Status history</p>
                        <p className="text-xs text-ink-500">Read from Inyo (GET /fx/transactions/&#123;id&#125;/status), most recent first.</p>
                    </div>
                    <button type="button" onClick={loadHistory} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600" title="Reload history" aria-label="Reload history">
                        <RefreshCw className="size-4" />
                    </button>
                </div>
                <StatusTimeline history={history} loading={history === null && !historyError} error={historyError} />
            </Card>

            <div className="print-hidden mt-6 flex flex-wrap justify-between gap-3">
                <Button as={Link} to="/transactions" variant="secondary" icon={History}>View all transactions</Button>
                <Button as={Link} to="/dashboard" icon={ArrowLeftRight}>New transfer</Button>
            </div>
        </div>
    );
}
