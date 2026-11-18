import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, CreditCard, History, ShieldCheck, UserRound, Users } from 'lucide-react';
import { request } from '../../api';
import { useSession } from '../../hooks';
import { errorMessage } from '../../lib/format';
import { transactionSummary } from '../../lib/status';
import { isUsable } from '../../lib/paymentMethods';
import type { Badge as BadgeInfo, Beneficiary, ComplianceInfo, PaymentMethod, Tone, Transaction } from '../../types';

export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/* ---------- helpers (pure, over the local transaction rows) ---------- */

const txDate = (t: Transaction) => new Date(t.createdAt || t.data?.createdAt || 0);
export const txTotal = (t: Transaction) => Number(t.amount ?? t.data?.totalAmount?.amount ?? 0);
export const txCurrency = (t: Transaction) => t.currency || t.data?.totalAmount?.currency || 'USD';
const txDestination = (t: Transaction) => t.data?.receivingAmount?.currency || t.data?.destinationAmount?.currency || t.data?.recipient?.countryCode || 'Other';

export const compact = (n: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 10000 ? 1 : 2 }).format(n);

export interface DestinationRow {
    key: string;
    count: number;
    sent: number;
    received: number;
    receivedCurrency?: string;
}

interface StatusRow {
    label: string;
    tone: Tone;
    count: number;
}

function buildStats(transactions: Transaction[]) {
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
        transactions.reduce<Record<string, DestinationRow>>((acc, t) => {
            const k = txDestination(t);
            acc[k] = acc[k] || { key: k, count: 0, sent: 0, received: 0, receivedCurrency: t.data?.receivingAmount?.currency };
            acc[k].count += 1;
            acc[k].sent += txTotal(t);
            acc[k].received += Number(t.data?.receivingAmount?.amount || 0);
            return acc;
        }, {}),
    ).sort((a, b) => b.sent - a.sent);

    const byStatus = Object.values(
        summaries.reduce<Record<string, StatusRow>>((acc, { s }: { s: BadgeInfo }) => {
            acc[s.label] = acc[s.label] || { label: s.label, tone: s.tone, count: 0 };
            acc[s.label].count += 1;
            return acc;
        }, {}),
    ).sort((a, b) => b.count - a.count);

    return { currency, total, last30, completed, inProgress, failed, byDestination, byStatus };
}

const levelLabel = (level: unknown) => String(level || '').replace('LEVEL_', 'Level ');

export interface ChecklistItem {
    key: string;
    done: boolean;
    to: string;
    icon: Icon;
    title: string;
    detail: string;
}

interface ChecklistInput {
    hasProfile: boolean;
    compliance: ComplianceInfo | null;
    beneficiaries: Beneficiary[];
    paymentMethods: PaymentMethod[];
}

/**
 * Readiness checklist, in the order the docs require before a transaction can be
 * created: sender profile -> compliance level >= 1 -> recipient -> verified funding account.
 */
function buildChecklist({ hasProfile, compliance, beneficiaries, paymentMethods }: ChecklistInput): ChecklistItem[] {
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

export const QUICK_ACTIONS: Array<{ to: string; icon: Icon; label: string; text: string }> = [
    { to: '/dashboard', icon: ArrowLeftRight, label: 'New transfer', text: 'Lock a rate and send.' },
    { to: '/beneficiaries', icon: Users, label: 'Beneficiaries', text: 'Recipients and accounts.' },
    { to: '/payment-methods', icon: CreditCard, label: 'Payment methods', text: 'Cards and bank accounts.' },
    { to: '/compliance', icon: ShieldCheck, label: 'Limits', text: 'Trust level and usage.' },
    { to: '/transactions', icon: History, label: 'Transactions', text: 'History and receipts.' },
    { to: '/profile', icon: UserRound, label: 'Personal info', text: 'Your sender profile.' },
];


interface OverviewState {
    loading: boolean;
    error: string | null;
    transactions: Transaction[];
    beneficiaries: Beneficiary[];
    paymentMethods: PaymentMethod[];
    compliance: ComplianceInfo | null;
}

export function useOverview() {
    const { user, hasProfile } = useSession();
    const [state, setState] = useState<OverviewState>({ loading: true, error: null, transactions: [], beneficiaries: [], paymentMethods: [], compliance: null });

    useEffect(() => {
        let cancelled = false;
        const calls = [
            request<Transaction[]>('get', '/transactions'),
            request<Beneficiary[]>('get', '/beneficiaries'),
            request<PaymentMethod[]>('get', '/payment-methods'),
            hasProfile ? request<ComplianceInfo>('get', '/compliance') : Promise.resolve(null),
        ] as const;
        Promise.allSettled(calls).then(([tx, ben, pm, comp]) => {
            if (cancelled) return;
            const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === 'fulfilled' && r.value != null ? r.value : fallback);
            setState({
                loading: false,
                // Only the transaction list is essential here; the others degrade to "not done".
                error: tx.status === 'rejected' ? errorMessage(tx.reason) : null,
                transactions: Array.isArray(val(tx, [])) ? val(tx, []) : [],
                beneficiaries: Array.isArray(val(ben, [])) ? val(ben, []) : [],
                paymentMethods: Array.isArray(val(pm, [])) ? val(pm, []) : [],
                compliance: val<ComplianceInfo | null>(comp, null),
            });
        });
        return () => { cancelled = true; };
    }, [user?.userId, hasProfile]);

    const { loading, error, transactions, beneficiaries, paymentMethods, compliance } = state;
    const stats = useMemo(() => buildStats(transactions), [transactions]);
    const checklist = useMemo(() => buildChecklist({ hasProfile, compliance, beneficiaries, paymentMethods }), [hasProfile, compliance, beneficiaries, paymentMethods]);
    const canSend = checklist.every((i) => i.done);
    const hasTransactions = transactions.length > 0;

    const navigate = useNavigate();
    const openReceipt = (txn: Transaction) => navigate('/transaction/receipt', { state: { transaction: txn, fromHistory: true } });
    const nextStep = checklist.find((i) => !i.done)?.to;

    return { user, hasProfile, loading, error, transactions, stats, checklist, canSend, hasTransactions, nextStep, openReceipt };
}

export type OverviewViewProps = ReturnType<typeof useOverview>;
