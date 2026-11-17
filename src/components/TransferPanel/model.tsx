import { useTransaction } from '../../hooks';
import { useQuoteCountdown } from '../../hooks';

/** The panel reads everything from the transfer context. */
export type TransferPanelProps = Record<string, never>;

/**
 * Sticky summary shown during the send flow. Everything here comes from the
 * quote object as returned by POST /payout/quotes (never recomputed client-side).
 */
export function useTransferPanel(_props: TransferPanelProps) {
    // Only rendered inside the send flow, under <TransactionProvider>.
    const { transactionData } = useTransaction();
    const { quote, beneficiary, account, paymentMethod } = transactionData;
    const countdown = useQuoteCountdown(quote);

    const src = quote?.sourceAmount;
    const dst = quote?.destinationAmount;

    return { quote, beneficiary, account, paymentMethod, countdown, src, dst };
}

export type TransferPanelViewProps = ReturnType<typeof useTransferPanel>;
