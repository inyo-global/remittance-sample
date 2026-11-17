/**
 * Shapes the frontend reads from the local BFF (server/). Inyo payloads are stored as-is in the
 * `data` columns, so those parts are typed by the fields the UI actually reads, plus an index
 * signature for everything else the API may send.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface Badge {
    label: string;
    tone: Tone;
}

/** Any JSON object we only partially model. */
export type Json = Record<string, unknown>;

// ---------------------------------------------------------------- auth / profile

export interface User {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipcode?: string | null;
    phoneNumber?: string | null;
    /** Legacy alias some pages read (same value as `id`). */
    userId?: string;
}

export interface AuthResponse {
    user: User;
    token: string;
}

export interface Profile {
    userId: string;
    gender?: string | null;
    occupation?: string | null;
    docType?: string | null;
    docNumber?: string | null;
    issuingCountry?: string | null;
    expirationDate?: string | null;
    /** Inyo sender id once the profile has been created upstream. */
    externalId?: string | null;
    ssnLast4?: string | null;
    data?: string | null;
}

export interface ProfileResponse {
    user: User;
    profile: Profile | null;
}

// ---------------------------------------------------------------- money

export interface Money {
    amount: number;
    currency: string;
}

export interface LimitWindow {
    limit: number | Money;
    used: number | Money;
}

export type LimitKey = 'oneDayLimit' | 'thirtyDaysLimit' | 'oneHundredAndEightyDaysLimit';

export interface Limits {
    oneDayLimit: LimitWindow;
    thirtyDaysLimit: LimitWindow;
    oneHundredAndEightyDaysLimit: LimitWindow;
}

export interface Quote {
    id?: string;
    quoteId?: string;
    amountType?: 'SOURCE' | 'DESTINATION' | string;
    sourceAmount?: Money;
    destinationAmount?: Money;
    fee?: Money;
    totalCost?: Money;
    effectiveRate?: number;
    createdAt?: string;
    expireAt?: string;
    [key: string]: unknown;
}

export interface Destination {
    countryCode?: string;
    /** ISO code as GET /destinations names it. */
    country?: string;
    countryName?: string;
    emoji?: string;
    name?: string;
    currency?: string;
    currencyCode?: string;
    [key: string]: unknown;
}

export interface Bank {
    code?: string;
    bankCode?: string;
    name?: string;
    bankName?: string;
    [key: string]: unknown;
}

// ---------------------------------------------------------------- beneficiaries

export interface BeneficiaryData {
    firstName?: string;
    lastName?: string;
    address?: { countryCode?: string; [key: string]: unknown };
    documents?: Array<{ type?: string; number?: string; document?: string; countryCode?: string; [key: string]: unknown }>;
    countryCode?: string;
    [key: string]: unknown;
}

export interface Beneficiary {
    id: string;
    userId?: string;
    nickname?: string | null;
    externalId?: string | null;
    data?: BeneficiaryData | null;
}

export interface PayoutMethod {
    type?: string;
    keyType?: string;
    key?: string;
    bankCode?: string;
    accountNumber?: string;
    accountType?: string;
    clabe?: string;
    walletId?: string;
    walletOperator?: string;
    [key: string]: unknown;
}

export interface BeneficiaryAccountData {
    asset?: string;
    payoutMethod?: PayoutMethod;
    [key: string]: unknown;
}

export interface BeneficiaryAccount {
    id: string;
    beneficiaryId?: string;
    externalId?: string | null;
    data?: BeneficiaryAccountData | null;
}

// ---------------------------------------------------------------- funding accounts (payment methods)

export type FundingStatus = 'Pending' | 'ActionRequired' | 'Verified' | 'Rejected' | 'Declined' | (string & {});

export interface FundingApiResponse {
    status?: FundingStatus;
    coreStatus?: string;
    statusMessage?: string;
    isActive?: boolean;
    redirectAcsUrl?: string | null;
    bankName?: string;
    accountNumber?: string;
    schemeId?: string;
    lastFourDigits?: string;
    gateway?: { paymentId?: string; [key: string]: unknown };
    [key: string]: unknown;
}

export interface CardToken {
    token?: string;
    schemeId?: string;
    cardType?: string;
    lastFourDigits?: string;
    nickname?: string;
    [key: string]: unknown;
}

export interface PaymentMethodData {
    apiResponse?: FundingApiResponse;
    status?: FundingStatus;
    redirectAcsUrl?: string | null;
    gatewayEvent?: Json;
    [key: string]: unknown;
}

export interface PaymentMethod {
    id: string;
    userId?: string;
    type: 'CARD' | 'ACH' | (string & {});
    externalId?: string | null;
    token?: CardToken | null;
    data?: PaymentMethodData | null;
}

export interface CardCreateResponse {
    success: boolean;
    id: string;
    externalId?: string;
    status: FundingStatus;
    redirectAcsUrl?: string | null;
    gatewayPaymentId?: string | null;
}

export interface AchCreateResponse {
    success: boolean;
    id: string;
    externalId?: string;
    status: FundingStatus;
}

export interface SyncResponse {
    success?: boolean;
    status: FundingStatus;
    coreStatus?: string;
    data?: FundingApiResponse;
}

export interface WebhookEvent {
    id: number;
    receivedAt: string;
    paymentId?: string | null;
    externalPaymentId?: string | null;
    status?: string | null;
    matchedCardId?: string | null;
    payload: Json;
}

export interface WebhookInfo {
    events: WebhookEvent[];
    publicUrl: string | null;
    path: string;
    basicAuth: boolean;
}

// ---------------------------------------------------------------- transactions

export type ComplianceStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Refunded' | 'Failed' | (string & {});
export type PayoutStatus = 'Pending' | 'Processing' | 'Completed' | 'Cancelled' | 'Failed' | 'Voided' | 'Refunded' | (string & {});

export interface TransactionData {
    id?: string;
    complianceStatus?: ComplianceStatus;
    payoutStatus?: PayoutStatus;
    paymentStatus?: string;
    status?: { complianceStatus?: ComplianceStatus; payoutStatus?: PayoutStatus; [key: string]: unknown } | string;
    totalAmount?: Money;
    sourceAmount?: Money;
    destinationAmount?: Money;
    fee?: Money;
    receivingAmount?: Money;
    anchorCurrencyAmount?: Money;
    conversionAmount?: Money;
    exchangeRate?: number;
    destinationExchangeRate?: { rate?: number; fromCurrency?: string; toCurrency?: string; [key: string]: unknown };
    receipt?: { license?: string; contactInfo?: string; rightToRefund?: string; cancellationDisclosure?: string; [key: string]: unknown };
    sender?: { name?: string; phoneNumber?: string; [key: string]: unknown };
    recipient?: { name?: string; phoneNumber?: string; countryCode?: string; [key: string]: unknown };
    createdAt?: string;
    [key: string]: unknown;
}

/** A transactions row from the BFF (`data` holds the Inyo payload). */
export interface Transaction {
    id: string;
    userId?: string;
    externalId?: string | null;
    status?: string | null;
    amount?: number | null;
    currency?: string | null;
    recipientName?: string | null;
    createdAt?: string | null;
    data?: TransactionData | null;
}

export interface TransactionStatusMessage {
    id?: string;
    message?: string;
    createdBy?: string;
    type?: string;
    [key: string]: unknown;
}

export interface TransactionHistoryRow {
    id?: string;
    complianceStatus?: ComplianceStatus;
    payoutStatus?: PayoutStatus;
    createdAt?: string;
    messages?: TransactionStatusMessage[];
    [key: string]: unknown;
}

/** POST /api/transactions answers the local row id merged with the Inyo payload (which wins on `id`). */
export type TransactionCreateResponse = TransactionData & { id: string; externalId?: string };

// ---------------------------------------------------------------- compliance / KYC / documents

export interface KycCheck {
    name?: string;
    check?: string;
    passed?: boolean;
    result?: string;
    [key: string]: unknown;
}

export interface KycResult {
    decision?: string;
    checks?: KycCheck[];
    [key: string]: unknown;
}

export interface KycSessionData {
    sessionId?: string;
    status?: string;
    widgetUrl?: string | null;
    result?: KycResult;
    completedAt?: string;
    [key: string]: unknown;
}

export interface KycSession {
    sessionId: string;
    userId?: string;
    status?: string | null;
    widgetUrl?: string | null;
    createdAt?: string | null;
    data?: KycSessionData | null;
}

export interface DocumentHistoryEntry {
    status?: string;
    reason?: string;
    verifiedBy?: string;
    createdAt?: string;
    [key: string]: unknown;
}

export interface SenderDocument {
    id: string;
    type?: string;
    subtype?: string;
    fileName?: string;
    status?: string;
    verificationStatus?: string;
    createdAt?: string;
    history?: DocumentHistoryEntry[];
    [key: string]: unknown;
}

export interface ComplianceLevel {
    level?: string;
    limits?: Partial<Record<LimitKey, Money>>;
    requiredFields?: string[];
    perTransactionFields?: string[];
    [key: string]: unknown;
}

/** GET /participants/{id}/complianceLevels */
export interface ComplianceInfo {
    currentComplianceLevel?: ComplianceLevel;
    nextComplianceLevel?: ComplianceLevel | null;
    missingFieldsForNextComplianceLevel?: string[];
    [key: string]: unknown;
}

// ---------------------------------------------------------------- JSON schema (recipient / account forms)

export interface JsonSchemaProperty {
    type?: string;
    title?: string;
    description?: string;
    enum?: unknown[];
    const?: unknown;
    properties?: Record<string, JsonSchemaProperty>;
    items?: JsonSchemaProperty;
    required?: string[];
    format?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    [key: string]: unknown;
}

export type JsonSchema = JsonSchemaProperty;

// ---------------------------------------------------------------- errors

export interface UpstreamError {
    source: 'inyo';
    status: number | null;
    method?: string;
    path?: string;
    message?: string;
    body?: unknown;
    hint?: string | null;
    cfRay?: string | null;
}

export interface LocalError {
    source: 'local';
    message: string;
}

export interface FieldError {
    fieldName: string;
    error: string;
}

// ---------------------------------------------------------------- send-money flow state

export interface TransactionDraft {
    countryCode: string | null;
    quote: Quote | null;
    beneficiary: Beneficiary | null;
    account: BeneficiaryAccount | null;
    paymentMethod: PaymentMethod | null;
}

// ---------------------------------------------------------------- BFF response envelopes

/** GET /api/destinations: the docs show `{ countryDestinations: [...] }`; some tenants answer a bare array. */
export type DestinationsResponse = { countryDestinations?: Destination[] } | Destination[];

/** GET /api/banks/:countryCode: a plain array per the docs; some tenants return `{ items: [...] }`. */
export type BanksResponse = Bank[] | { items?: Bank[] };

/** POST /api/quotes: either `{ quotes: [...] }` or a single quote. */
export type QuotesResponse = ({ quotes?: Quote[] } & Partial<Quote>) | Quote;

export interface BeneficiaryCreateResponse {
    id: string;
    externalId?: string;
}

export interface BeneficiaryAccountCreateResponse {
    id: string;
    externalAccountId?: string;
}
