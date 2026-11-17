/** Browser globals installed by the vendor scripts the AddPayment page injects. */

interface InyoTokenizerResponse {
    status?: string;
    reasonCode?: string;
    code?: string;
    message?: string;
    additionalData?: { token?: string; lastFourDigits?: string; [key: string]: unknown };
    [key: string]: unknown;
}

interface InyoTokenizerOptions {
    targetId: string;
    storeLaterUse?: boolean;
    publicKey?: string;
    threeDSData?: { enable: boolean; enablePostMessage?: boolean; successUrl?: string; failUrl?: string };
    successCallback: (resp: InyoTokenizerResponse) => void;
    errorCallback: (resp: InyoTokenizerResponse) => void;
}

interface InyoTokenizerInstance {
    tokenData: InyoTokenizerResponse | null;
    tokenizeCard: () => void;
}

interface PlaidLinkMetadata {
    accounts?: Array<{ id?: string; [key: string]: unknown }>;
    institution?: { name?: string; [key: string]: unknown } | null;
    [key: string]: unknown;
}

interface PlaidLinkError {
    display_message?: string | null;
    error_message?: string | null;
    [key: string]: unknown;
}

interface PlaidLinkHandler {
    open: () => void;
}

interface PlaidLinkOptions {
    token: string;
    onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
    onExit: (err: PlaidLinkError | null, metadata?: PlaidLinkMetadata) => void;
}

interface Window {
    InyoTokenizer?: new (options: InyoTokenizerOptions) => InyoTokenizerInstance;
    Plaid?: { create: (options: PlaidLinkOptions) => PlaidLinkHandler };
}
