import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import { useToast } from '../lib/toast';
import { request } from '../api';
import { amount, dateOnly, errorMessage, initials, money, timeOnly } from '../lib/format';
import { TONE_TEXT, complianceTone, payoutTone, transactionSummary } from '../lib/status';

const Transactions = ({ user }) => {
    const navigate = useNavigate();
    const toast = useToast();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [syncing, setSyncing] = useState(null);

    useEffect(() => {
        let cancelled = false;
        request('get', '/transactions')
            .then((data) => !cancelled && setTransactions(data))
            .catch((err) => !cancelled && setError(errorMessage(err)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [user?.userId]);

    // Polls GET /fx/transactions/{id} through the BFF (webhooks are the production path).
    const sync = async (e, txn) => {
        e.stopPropagation();
        setSyncing(txn.id);
        try {
            const updated = await request('get', `/transactions/${txn.id}/sync`);
            setTransactions((list) => list.map((t) => (t.id === txn.id ? updated : t)));
            toast.success('Status refreshed', `${updated.data?.complianceStatus || ''} / ${updated.data?.payoutStatus || ''}`);
        } catch (err) {
            toast.error('Could not refresh status', errorMessage(err));
        } finally {
            setSyncing(null);
        }
    };

    return (
        <div>
            <PageHeader kicker="Send money" title="Transactions" description="Every transfer created through this sample, with its compliance and payout status." actions={<Button as={Link} to="/dashboard" icon={ArrowLeftRight}>New transfer</Button>} />

            {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading transactions…" />
            ) : transactions.length === 0 ? (
                <EmptyState icon={ArrowLeftRight} title="No transfers yet" description="Your transaction history and receipts will show up here." action={<Button as={Link} to="/dashboard">Start a transfer</Button>} />
            ) : (
                <Card className="overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-ink-50 text-left">
                            <tr className="kicker">
                                <th className="px-5 py-3 font-semibold">Date</th>
                                <th className="px-5 py-3 font-semibold">Recipient</th>
                                <th className="hidden px-5 py-3 font-semibold md:table-cell">Status</th>
                                <th className="px-5 py-3 text-right font-semibold">Amount</th>
                                <th className="w-12 px-3 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100">
                            {transactions.map((txn) => {
                                const d = txn.data || {};
                                const summary = transactionSummary(txn);
                                const recipient = d.recipient?.name || txn.recipientName || '—';
                                return (
                                    <tr
                                        key={txn.id}
                                        onClick={() => navigate('/transaction/receipt', { state: { transaction: txn, fromHistory: true } })}
                                        className="cursor-pointer transition-colors hover:bg-brand-50/40"
                                    >
                                        <td className="px-5 py-4 align-top">
                                            <p className="whitespace-nowrap font-medium text-ink-800">{dateOnly(txn.createdAt || d.createdAt)}</p>
                                            <p className="text-xs text-ink-400">{timeOnly(txn.createdAt || d.createdAt)}</p>
                                        </td>
                                        <td className="px-5 py-4 align-top">
                                            <div className="flex items-center gap-3">
                                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{initials(recipient)}</span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-ink-900">{recipient}</p>
                                                    <p className="text-xs text-ink-400">
                                                        {d.receivingAmount ? `receives ${amount(d.receivingAmount.amount, d.receivingAmount.currency)}` : 'Bank deposit'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-2 md:hidden"><Badge tone={summary.tone} dot>{summary.label}</Badge></div>
                                        </td>
                                        <td className="hidden px-5 py-4 align-top md:table-cell">
                                            <Badge tone={summary.tone} dot>{summary.label}</Badge>
                                            <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-ink-400">
                                                {d.complianceStatus && <span>Compliance: <span className={`font-medium ${TONE_TEXT[complianceTone(d.complianceStatus)]}`}>{d.complianceStatus}</span></span>}
                                                {d.payoutStatus && <span>· Payout: <span className={`font-medium ${TONE_TEXT[payoutTone(d.payoutStatus)]}`}>{d.payoutStatus}</span></span>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right align-top">
                                            <p className="whitespace-nowrap font-semibold tabular-nums text-ink-900">{money(txn.amount ?? d.totalAmount?.amount, txn.currency || d.totalAmount?.currency)}</p>
                                            {d.fee && <p className="hidden text-xs text-ink-400 sm:block">incl. {money(d.fee.amount, d.fee.currency)} fee</p>}
                                        </td>
                                        <td className="px-3 py-4 text-right align-top">
                                            <button
                                                type="button"
                                                onClick={(e) => sync(e, txn)}
                                                disabled={syncing === txn.id}
                                                className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600 disabled:opacity-50"
                                                title="Refresh status from Inyo"
                                                aria-label="Refresh status"
                                            >
                                                <RefreshCw className={`size-4 ${syncing === txn.id ? 'animate-spin' : ''}`} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>
            )}
        </div>
    );
};

export default Transactions;
