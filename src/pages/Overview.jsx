import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Check, CheckCircle2, Circle, Clock, CreditCard, Globe2, History, Receipt as ReceiptIcon, ShieldCheck, UserRound, Users } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import Alert from '../components/ui/Alert';
import { request } from '../api';
import { amount, dateOnly, errorMessage, initials, money } from '../lib/format';
import { transactionSummary } from '../lib/status';
import { isUsable } from '../lib/paymentMethods';
import { cx } from '../lib/cx';

/* ---------- helpers (pure, over the local transaction rows) ---------- */

const txDate = (t) => new Date(t.createdAt || t.data?.createdAt || 0);
const txTotal = (t) => Number(t.amount ?? t.data?.totalAmount?.amount ?? 0);
const txCurrency = (t) => t.currency || t.data?.totalAmount?.currency || 'USD';
const txDestination = (t) => t.data?.receivingAmount?.currency || t.data?.destinationAmount?.currency || t.data?.recipient?.countryCode || 'Other';

const compact = (n, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 10000 ? 1 : 2 }).format(n);

function buildStats(transactions) {
    const now = Date.now();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    const currency = transactions[0] ? txCurrency(transactions[0]) : 'USD';

    const total = transactions.reduce((s, t) => s + txTotal(t), 0);
    const last30 = transactions.filter((t) => now - txDate(t).getTime() <= days30).reduce((s, t) => s + txTotal(t), 0);
    const summaries = transactions.map((t) => ({ t, s: transactionSummary(t) }));
    const completed = summaries.filter(({ s }) => s.tone === 'success').length;
    const inProgress = summaries.filter(({ s }) => s.tone === 'warning' || s.tone === 'info').length;
    const failed = summaries.filter(({ s }) => s.tone === 'danger').length;

    const byDestination = Object.values(
        transactions.reduce((acc, t) => {
            const k = txDestination(t);
            acc[k] = acc[k] || { key: k, count: 0, sent: 0, received: 0, receivedCurrency: t.data?.receivingAmount?.currency };
            acc[k].count += 1;
            acc[k].sent += txTotal(t);
            acc[k].received += Number(t.data?.receivingAmount?.amount || 0);
            return acc;
        }, {}),
    ).sort((a, b) => b.sent - a.sent);

    const byStatus = Object.values(
        summaries.reduce((acc, { s }) => {
            acc[s.label] = acc[s.label] || { label: s.label, tone: s.tone, count: 0 };
            acc[s.label].count += 1;
            return acc;
        }, {}),
    ).sort((a, b) => b.count - a.count);

    return { currency, total, last30, completed, inProgress, failed, byDestination, byStatus };
}

const levelLabel = (level) => String(level || '').replace('LEVEL_', 'Level ');

/**
 * Readiness checklist, in the order the docs require before a transaction can be
 * created: sender profile -> compliance level >= 1 -> recipient -> verified funding account.
 */
function buildChecklist({ hasProfile, compliance, beneficiaries, paymentMethods }) {
    const level = compliance?.currentComplianceLevel?.level;
    const levelOk = !!level && level !== 'LEVEL_0';
    const usable = paymentMethods.filter(isUsable).length;
    return [
        {
            key: 'profile', done: hasProfile, to: '/profile', icon: UserRound,
            title: 'Complete your personal information',
            detail: hasProfile ? 'Sender registered with Inyo.' : 'Name, address, date of birth and an identity document. Required before anything else.',
        },
        {
            key: 'compliance', done: levelOk, to: '/compliance', icon: ShieldCheck,
            title: 'Reach compliance level 1',
            detail: !hasProfile ? 'Assigned by Inyo once your profile is saved.' : levelOk ? `You are at ${levelLabel(level)}.` : compliance ? 'Level 0: check the missing fields on the Compliance page.' : 'Could not read your level yet. Open the Compliance page to retry.',
        },
        {
            key: 'beneficiary', done: beneficiaries.length > 0, to: '/beneficiaries', icon: Users,
            title: 'Add a beneficiary',
            detail: beneficiaries.length ? `${beneficiaries.length} saved.` : 'The person who receives the money, with a bank account or PIX key.',
        },
        {
            key: 'payment', done: usable > 0, to: '/payment-methods', icon: CreditCard,
            title: 'Add a verified payment method',
            detail: usable ? `${usable} ready to use.` : paymentMethods.length ? 'Added, but none is Verified yet (3DS or Plaid pending).' : 'A card or a bank account linked with Plaid.',
        },
    ];
}

/* ---------- presentational pieces ---------- */

function StatTile({ label, value, hint, icon: Icon, tone = 'brand' }) {
    const tones = {
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

function Checklist({ items, firstTransfer }) {
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

const QUICK_ACTIONS = [
    { to: '/dashboard', icon: ArrowLeftRight, label: 'New transfer', text: 'Lock a rate and send.' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries', text: 'Recipients and accounts.' },
    { to: '/payment-methods', icon: CreditCard, label: 'Payment methods', text: 'Cards and bank accounts.' },
    { to: '/compliance', icon: ShieldCheck, label: 'Limits', text: 'Trust level and usage.' },
    { to: '/transactions', icon: History, label: 'Transactions', text: 'History and receipts.' },
    { to: '/profile', icon: UserRound, label: 'Personal info', text: 'Your sender profile.' },
];

function QuickActions({ canSend }) {
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
function DestinationBars({ rows, currency }) {
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

function RecentTransfers({ transactions }) {
    const navigate = useNavigate();
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
                                onClick={() => navigate('/transaction/receipt', { state: { transaction: txn, fromHistory: true } })}
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

const Overview = ({ user, hasProfile }) => {
    const [state, setState] = useState({ loading: true, error: null, transactions: [], beneficiaries: [], paymentMethods: [], compliance: null });

    useEffect(() => {
        let cancelled = false;
        const calls = [
            request('get', '/transactions'),
            request('get', '/beneficiaries'),
            request('get', '/payment-methods'),
            hasProfile ? request('get', '/compliance') : Promise.resolve(null),
        ];
        Promise.allSettled(calls).then(([tx, ben, pm, comp]) => {
            if (cancelled) return;
            const val = (r, fallback) => (r.status === 'fulfilled' && r.value != null ? r.value : fallback);
            setState({
                loading: false,
                // Only the transaction list is essential here; the others degrade to "not done".
                error: tx.status === 'rejected' ? errorMessage(tx.reason) : null,
                transactions: Array.isArray(val(tx, [])) ? val(tx, []) : [],
                beneficiaries: Array.isArray(val(ben, [])) ? val(ben, []) : [],
                paymentMethods: Array.isArray(val(pm, [])) ? val(pm, []) : [],
                compliance: val(comp, null),
            });
        });
        return () => { cancelled = true; };
    }, [user?.userId, hasProfile]);

    const { loading, error, transactions, beneficiaries, paymentMethods, compliance } = state;
    const stats = useMemo(() => buildStats(transactions), [transactions]);
    const checklist = useMemo(() => buildChecklist({ hasProfile, compliance, beneficiaries, paymentMethods }), [hasProfile, compliance, beneficiaries, paymentMethods]);
    const canSend = checklist.every((i) => i.done);
    const hasTransactions = transactions.length > 0;

    return (
        <div>
            <PageHeader
                kicker={`Hi ${user?.firstName || 'there'}`}
                title="Overview"
                description={hasTransactions ? 'What this account has sent through Inyo so far.' : 'Get your account ready, then send your first transfer.'}
                actions={<Button as={Link} to={canSend ? '/dashboard' : checklist.find((i) => !i.done)?.to || '/dashboard'} icon={canSend ? ArrowLeftRight : ArrowRight}>{canSend ? 'New transfer' : 'Continue setup'}</Button>}
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
                                <RecentTransfers transactions={transactions} />
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
                                    <Button as={Link} to={canSend ? '/dashboard' : checklist.find((i) => !i.done)?.to || '/profile'} iconRight={ArrowRight} disabled={false}>
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
};

export default Overview;
