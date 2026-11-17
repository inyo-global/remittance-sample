/**
 * Status vocabularies from the Inyo Remittances docs
 * (dev.inyoglobal.com/api-references/remittances/transaction, /sender-funding-account).
 * Each helper returns { label, tone } for <Badge>.
 */
import type { Badge, ComplianceStatus, FundingStatus, PayoutStatus, Tone, Transaction, TransactionData, TransactionHistoryRow } from '../types';

const title = (s: unknown): string => String(s || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

// complianceStatus: Pending | Approved | Rejected | Cancelled | Refunded | Failed
export function complianceTone(status: ComplianceStatus | null | undefined): Tone {
    switch (status) {
        case 'Approved': return 'success';
        case 'Pending': return 'warning';
        case 'Rejected':
        case 'Failed': return 'danger';
        case 'Cancelled':
        case 'Refunded': return 'neutral';
        default: return 'neutral';
    }
}

// payoutStatus: Pending | Processing | Completed | Cancelled | Failed | Voided | Refunded
export function payoutTone(status: PayoutStatus | null | undefined): Tone {
    switch (status) {
        case 'Completed': return 'success';
        case 'Processing': return 'info';
        case 'Pending': return 'warning';
        case 'Failed': return 'danger';
        case 'Cancelled':
        case 'Voided':
        case 'Refunded': return 'neutral';
        default: return 'neutral';
    }
}

// Funding account status: Pending | ActionRequired | Verified | Rejected (complete set per docs)
const FUNDING_CANON: Record<string, FundingStatus> = { pending: 'Pending', actionrequired: 'ActionRequired', verified: 'Verified', rejected: 'Rejected', declined: 'Declined' };
/** Canonical funding status: GET /fundingAccounts may answer "Actionrequired" while POST answers "ActionRequired". */
export const canonicalFundingStatus = (status: FundingStatus | null | undefined): FundingStatus =>
    FUNDING_CANON[String(status || '').toLowerCase()] || (status as FundingStatus);

export function fundingStatus(status: FundingStatus | null | undefined): Badge {
    switch (canonicalFundingStatus(status)) {
        case 'Verified': return { label: 'Verified', tone: 'success' };
        case 'ActionRequired': return { label: '3DS required', tone: 'warning' };
        case 'Pending': return { label: 'Pending', tone: 'warning' };
        case 'Rejected': return { label: 'Rejected', tone: 'danger' };
        // Legacy value this sample used before the docs settled on "Rejected"
        case 'Declined': return { label: 'Declined', tone: 'danger' };
        default: return { label: title(status) || 'Unknown', tone: 'neutral' };
    }
}

/** A transaction row from the BFF or a bare Inyo payload: both carry the same status fields. */
type TransactionLike = Partial<Transaction> | TransactionData | null | undefined;

const statuses = (tx: TransactionLike) => {
    const row = tx && 'data' in tx ? (tx.data as TransactionData | null | undefined) : (tx as TransactionData | null | undefined);
    const data: TransactionData = row || ({} as TransactionData);
    const nested = typeof data.status === 'object' && data.status ? data.status : undefined;
    const compliance = data.complianceStatus || nested?.complianceStatus;
    const payout = data.payoutStatus || nested?.payoutStatus || (typeof tx?.status === 'string' ? tx.status : undefined);
    return { data, compliance, payout };
};

/** Summarise a transaction row into one headline badge for lists. */
export function transactionSummary(tx: TransactionLike): Badge {
    const { data, compliance, payout } = statuses(tx);
    const payment = data.paymentStatus;

    if (payment === 'ActionRequired') return { label: '3DS pending', tone: 'warning' };
    if (compliance && ['Rejected', 'Failed'].includes(compliance)) return { label: `Compliance ${compliance.toLowerCase()}`, tone: 'danger' };
    if (payout === 'Completed') return { label: 'Completed', tone: 'success' };
    if (payout === 'Failed') return { label: 'Payout failed', tone: 'danger' };
    if (payout && ['Cancelled', 'Voided', 'Refunded'].includes(payout)) return { label: payout, tone: 'neutral' };
    if (payout === 'Processing') return { label: 'Processing', tone: 'info' };
    if (compliance === 'Pending') return { label: 'Compliance review', tone: 'warning' };
    return { label: title(payout) || 'Pending', tone: 'warning' };
}

/**
 * Reversible while the payment is pre-authorised or captured but not delivered
 * (docs: transaction > "Cancelling / Reversing"). Paid/Completed and every terminal
 * state can no longer be reversed through the API.
 */
export function isReversible(tx: TransactionLike): boolean {
    const { compliance, payout } = statuses(tx);
    if (compliance && ['Rejected', 'Cancelled', 'Refunded', 'Failed'].includes(compliance)) return false;
    if (payout && ['Completed', 'Cancelled', 'Failed', 'Voided', 'Refunded'].includes(payout)) return false;
    return true;
}

/** One badge per history row: the payout status is the operational one; compliance explains blocks. */
export function historyTone(row: TransactionHistoryRow | null | undefined): Tone {
    const c = row?.complianceStatus;
    const p = row?.payoutStatus;
    if ((c && ['Rejected', 'Failed'].includes(c)) || p === 'Failed') return 'danger';
    if (p === 'Completed') return 'success';
    if (p && ['Cancelled', 'Voided', 'Refunded'].includes(p)) return 'neutral';
    if (p === 'Processing') return 'info';
    return 'warning';
}

/* Static class maps: Tailwind only emits classes it can see, so no template-string class names. */
export const TONE_TEXT: Record<Tone, string> = { success: 'text-success-700', warning: 'text-warning-700', danger: 'text-danger-700', info: 'text-info-700', neutral: 'text-ink-600' };
export const TONE_DOT: Record<Tone, string> = { success: 'bg-success-500', warning: 'bg-warning-500', danger: 'bg-danger-500', info: 'bg-info-500', neutral: 'bg-ink-400' };

export const prettyStatus = title;
