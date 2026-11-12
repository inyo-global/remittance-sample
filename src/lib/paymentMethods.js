import { canonicalFundingStatus } from './status';

/** Helpers to read a locally stored funding account (payment_methods row). */
export const methodStatus = (pm) => canonicalFundingStatus(pm.data?.apiResponse?.status || pm.data?.status || 'Unknown');
export const isUsable = (pm) => methodStatus(pm) === 'Verified';
export const needsChallenge = (pm) => methodStatus(pm) === 'ActionRequired';
/** The ACS URL from the creation response; GET /fundingAccounts does not always echo it back. */
export const challengeUrl = (pm) => pm.data?.apiResponse?.redirectAcsUrl || pm.data?.redirectAcsUrl || null;

export const methodTitle = (pm) =>
    pm.type === 'ACH' ? pm.data?.apiResponse?.bankName || pm.token?.nickname || 'Bank account' : `${pm.token?.schemeId || pm.data?.apiResponse?.schemeId || 'Card'}`;

export const methodSubtitle = (pm) => {
    if (pm.type === 'ACH') {
        const acct = pm.data?.apiResponse?.accountNumber || '';
        return `ACH ···· ${acct.slice(-4) || '····'}`;
    }
    const last4 = pm.token?.lastFourDigits || pm.data?.apiResponse?.lastFourDigits;
    return `${pm.token?.cardType ? `${pm.token.cardType.toLowerCase()} card` : 'Card'} ···· ${last4 || '····'}`;
};
