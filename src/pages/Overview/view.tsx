import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Check, CheckCircle2, Circle, Clock, Globe2, Receipt as ReceiptIcon } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import { amount, dateOnly, initials, money } from '../../lib/format';
import { transactionSummary } from '../../lib/status';
import { cx } from '../../lib/cx';
import type { Transaction } from '../../types';
import { QUICK_ACTIONS, compact, txCurrency, txTotal, type ChecklistItem, type DestinationRow, type Icon, type OverviewViewProps } from './model';

/* ---------- presentational pieces ---------- */

type StatTone = 'brand' | 'success' | 'warning' | 'neutral';

function StatTile({ label, value, hint, icon: Icon, tone = 'brand' }: { label: string; value: ReactNode; hint?: string; icon: Icon; tone?: StatTone }) {
    const tones: Record<StatTone, string> = {
        brand: 'bg-brand-50 text-brand-600',
        success: 'bg-success-50 text-success-600',
        warning: 'bg-warning-50 text-warning-600',
        neutral: 'bg-ink-100 text-ink-500',
    };
    return (
        <Card>
            <CardBody className="flex items-start gap-4 py-4">
                <div className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
                    <Icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0">
                    <p className="text-sm text-ink-500">{label}</p>
                    <p className="mt-0.5 truncate text-2xl font-semibold text-ink-900">{value}</p>
                    {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
                </div>
            </CardBody>
        </Card>
    );
}

function Checklist({ items, firstTransfer }: { items: ChecklistItem[]; firstTransfer: boolean }) {
    const remaining = items.filter((i) => !i.done).length;
    return (
        <Card>
            <CardHeader
                title={remaining ? (firstTransfer ? 'Before your first transfer' : 'Account setup') : 'Account ready'}
                description={remaining ? `${remaining} of ${items.length} steps left. Inyo requires all of them to create a transaction.` : 'Everything Inyo needs is in place.'}
            />
            <ul className="divide-y divide-ink-100">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <li key={item.key}>
                            <Link to={item.to} className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-brand-50/40">
                                <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full', item.done ? 'bg-success-500 text-white' : 'border-2 border-ink-200 text-transparent')} aria-hidden>
                                    {item.done ? <Check className="size-3.5" strokeWidth={3} /> : <Circle className="size-3" />}
                                </span>
                                <Icon className="size-4 shrink-0 text-ink-400" aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className={cx('block text-sm font-medium', item.done ? 'text-ink-500 line-through decoration-ink-300' : 'text-ink-900')}>{item.title}</span>
                                    <span className="block text-xs text-ink-400">{item.detail}</span>
                                </span>
                                {!item.done && <ArrowRight className="size-4 shrink-0 text-brand-600" aria-hidden />}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}

function QuickActions({ canSend }: { canSend: boolean }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {QUICK_ACTIONS.map(({ to, icon: Icon, label, text }) => {
                const primary = to === '/dashboard';
                return (
                    <Link
                        key={to}
                        to={to}
                        className={cx(
                            'group rounded-2xl border p-4 transition-all',
                            primary && canSend ? 'border-brand-500 bg-brand-600 text-white shadow-sm hover:bg-brand-700' : 'border-ink-200 bg-white hover:border-brand-300 hover:shadow-sm',
                        )}
                    >
                        <Icon className={cx('size-5', primary && canSend ? 'text-white' : 'text-brand-600')} aria-hidden />
                        <p className={cx('mt-3 text-sm font-semibold', primary && canSend ? 'text-white' : 'text-ink-900')}>{label}</p>
                        <p className={cx('text-xs', primary && canSend ? 'text-brand-100' : 'text-ink-400')}>{text}</p>
                    </Link>
                );
            })}
        </div>
    );
}

/** Horizontal single-hue bars: magnitude only, so one ramp and labels in text tokens. */
function DestinationBars({ rows, currency }: { rows: DestinationRow[]; currency: string }) {
    const max = Math.max(...rows.map((r) => r.sent), 1);
    return (
        <ul className="space-y-3">
            {rows.map((r) => (
                <li key={r.key} title={`${r.key}: ${r.count} transfer${r.count === 1 ? '' : 's'}, ${money(r.sent, currency)} sent`}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-ink-800">
                            {r.key} <span className="text-xs text-ink-400">· {r.count} transfer{r.count === 1 ? '' : 's'}</span>
                        </span>
                        <span className="tabular-nums text-ink-700">
                            {money(r.sent, currency)}
                            {r.received > 0 && r.receivedCurrency && <span className="ml-2 text-xs text-ink-400">→ {amount(r.received, r.receivedCurrency)}</span>}
                        </span>
                    </div>
                    <div className="h-3 w-full rounded-r bg-ink-100">
                        <div className="h-3 rounded-r bg-brand-500 transition-all" style={{ width: `${Math.max(2, (r.sent / max) * 100)}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

function RecentTransfers({ transactions, openReceipt }: { transactions: Transaction[]; openReceipt: (txn: Transaction) => void }) {
    return (
        <Card>
            <CardHeader
                title="Recent transfers"
                description="Latest five. Open the receipt, or refresh a status from the full list."
                action={<Button as={Link} to="/transactions" size="sm" variant="ghost" iconRight={ArrowRight}>All transactions</Button>}
            />
            <ul className="divide-y divide-ink-100">
                {transactions.slice(0, 5).map((txn) => {
                    const d = txn.data || {};
                    const summary = transactionSummary(txn);
                    const recipient = d.recipient?.name || txn.recipientName || '—';
                    return (
                        <li key={txn.id}>
                            <button
                                type="button"
                                onClick={() => openReceipt(txn)}
                                className="flex w-full items-center gap-4 px-6 py-3.5 text-left transition-colors hover:bg-brand-50/40"
                            >
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{initials(recipient)}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-ink-900">{recipient}</span>
                                    <span className="block text-xs text-ink-400">
                                        {dateOnly(txn.createdAt || d.createdAt)}
                                        {d.receivingAmount ? ` · receives ${amount(d.receivingAmount.amount, d.receivingAmount.currency)}` : ''}
                                    </span>
                                </span>
                                <span className="hidden sm:block"><Badge tone={summary.tone} dot>{summary.label}</Badge></span>
                                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-900">{money(txTotal(txn), txCurrency(txn))}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}

/* ---------- page ---------- */

export default function OverviewView({ user, hasProfile, loading, error, transactions, stats, checklist, canSend, hasTransactions, nextStep, openReceipt }: OverviewViewProps) {
    return (
        <div>
            <PageHeader
                kicker={`Hi ${user?.firstName || 'there'}`}
                title="Overview"
                description={hasTransactions ? 'What this account has sent through Inyo so far.' : 'Get your account ready, then send your first transfer.'}
                actions={<Button as={Link} to={canSend ? '/dashboard' : nextStep || '/dashboard'} icon={canSend ? ArrowLeftRight : ArrowRight}>{canSend ? 'New transfer' : 'Continue setup'}</Button>}
            />

            {error && <Alert tone="danger" className="mb-6" title="Could not load your transactions">{error}</Alert>}

            {!hasProfile && (
                <Alert tone="warning" className="mb-6" title="Personal information required" action={<Button as={Link} to="/profile" size="sm" variant="secondary">Complete profile</Button>}>
                    Inyo registers you as a sender from this data and runs KYC on it. Transfers, limits and compliance stay unavailable until it is saved.
                </Alert>
            )}

            {loading ? (
                <Spinner label="Loading your account…" />
            ) : (
                <div className="space-y-6">
                    <QuickActions canSend={canSend} />

                    {hasTransactions ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatTile label="Total sent" value={compact(stats.total, stats.currency)} hint={`${transactions.length} transfer${transactions.length === 1 ? '' : 's'} in total`} icon={ArrowLeftRight} />
                                <StatTile label="Sent in the last 30 days" value={compact(stats.last30, stats.currency)} hint="Counts toward your 30-day limit" icon={Clock} tone="neutral" />
                                <StatTile label="Completed" value={stats.completed} hint="Payout completed" icon={CheckCircle2} tone="success" />
                                <StatTile label="In progress" value={stats.inProgress} hint={stats.failed ? `${stats.failed} failed or rejected` : 'Compliance review or payout pending'} icon={Globe2} tone="warning" />
                            </div>

                            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                                <Card>
                                    <CardHeader title="Volume by destination" description={`Amount charged in ${stats.currency}, per destination currency.`} />
                                    <CardBody>
                                        <DestinationBars rows={stats.byDestination} currency={stats.currency} />
                                    </CardBody>
                                </Card>
                                <Card>
                                    <CardHeader title="By status" description="Headline status of each transfer." />
                                    <CardBody className="py-2">
                                        <ul className="divide-y divide-ink-100">
                                            {stats.byStatus.map((s) => (
                                                <li key={s.label} className="flex items-center justify-between py-3">
                                                    <Badge tone={s.tone} dot>{s.label}</Badge>
                                                    <span className="text-sm font-semibold tabular-nums text-ink-800">{s.count}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardBody>
                                </Card>
                            </div>

                            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                                <RecentTransfers transactions={transactions} openReceipt={openReceipt} />
                                <Checklist items={checklist} firstTransfer={false} />
                            </div>
                        </>
                    ) : (
                        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                            <Checklist items={checklist} firstTransfer />
                            <Card>
                                <CardBody className="flex h-full flex-col items-start justify-center gap-3 py-8">
                                    <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                                        <ReceiptIcon className="size-5" aria-hidden />
                                    </div>
                                    <h2 className="text-base font-semibold text-ink-900">Nothing sent yet</h2>
                                    <p className="text-sm text-ink-500">
                                        {canSend
                                            ? 'Your account is ready. Lock a quote, pick a beneficiary and a payment method, and the totals, destinations and statuses will appear here.'
                                            : 'Finish the setup steps first. Once a transfer is created, totals, destinations and statuses will appear here.'}
                                    </p>
                                    <Button as={Link} to={canSend ? '/dashboard' : nextStep || '/profile'} iconRight={ArrowRight} disabled={false}>
                                        {canSend ? 'Send your first transfer' : 'Continue setup'}
                                    </Button>
                                </CardBody>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
