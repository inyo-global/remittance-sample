/**
 * Step order follows the docs' transaction lifecycle:
 * quote -> recipient -> recipient account -> funding account -> create transaction.
 */
export const STEPS = [
    { key: 'amount', label: 'Amount', match: (p) => p === '/dashboard' },
    { key: 'beneficiary', label: 'Beneficiary', match: (p) => p === '/beneficiaries' || p === '/beneficiaries/new' },
    { key: 'account', label: 'Delivery', match: (p) => /^\/beneficiaries\/[^/]+\/account$/.test(p) },
    { key: 'payment', label: 'Payment', match: (p) => p === '/payment' },
    { key: 'review', label: 'Review', match: (p) => p === '/transaction/review' },
];

export function currentStepIndex(pathname) {
    return STEPS.findIndex((s) => s.match(pathname));
}

/** The send flow is in progress once a quote has been locked on the Amount step. */
export const inTransferFlow = (transactionData) => !!transactionData?.quote;

/**
 * Beneficiaries, delivery and payment pages double as account-management screens (sidebar,
 * Overview). The stepper and the transfer panel only belong there while a transfer is in progress.
 */
export function showsTransferChrome(pathname, transactionData) {
    const index = currentStepIndex(pathname);
    if (index < 0) return false;
    if (index === 0 || index === STEPS.length - 1) return true;
    return inTransferFlow(transactionData);
}
