/** Row shapes of the local SQLite tables (see db.ts). JSON columns are strings until parsed. */

export interface UserRow {
    id: string;
    email: string;
    password: string;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipcode: string | null;
    phoneNumber: string | null;
}

export interface ProfileRow {
    userId: string;
    gender: string | null;
    occupation: string | null;
    docType: string | null;
    docNumber: string | null;
    issuingCountry: string | null;
    expirationDate: string | null;
    externalId: string | null;
    data: string | null;
    ssn: string | null;
}

export interface BeneficiaryRow {
    id: string;
    userId: string;
    nickname: string | null;
    externalId: string | null;
    data: string;
}

export interface BeneficiaryAccountRow {
    id: string;
    beneficiaryId: string;
    externalId: string | null;
    data: string;
}

export interface QuoteRow {
    id: string;
    userId: string;
    quoteId: string;
    fromCurrency: string;
    toCurrency: string;
    amount: number;
    data: string;
}

export interface PaymentMethodRow {
    id: string;
    userId: string;
    token: string;
    data: string;
    type: 'CARD' | 'ACH' | string;
    externalId: string | null;
}

export interface TransactionRow {
    id: string;
    userId: string;
    externalId: string | null;
    status: string | null;
    amount: number | null;
    currency: string | null;
    recipientName: string | null;
    createdAt: string;
    data: string;
}

export interface WebhookEventRow {
    id: number;
    receivedAt: string;
    paymentId: string | null;
    externalPaymentId: string | null;
    status: string | null;
    matchedCardId: string | null;
    payload: string;
}

export interface KycSessionRow {
    sessionId: string;
    userId: string;
    status: string | null;
    widgetUrl: string | null;
    createdAt: string;
    data: string | null;
}

/**
 * An Inyo payload stored or forwarded as-is. The BFF reads a handful of fields and passes the rest
 * through, so these stay loosely typed on purpose; narrow at the point of use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UpstreamJson = Record<string, any>;

/** The JWT payload `authenticateToken` puts on `req.user`. */
export interface JwtUser {
    id: string;
    email: string;
}

declare global {
    // Express augments Request through this namespace; there is no module-syntax alternative.
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: JwtUser;
        }
    }
}
