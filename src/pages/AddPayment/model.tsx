import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Landmark } from 'lucide-react';
import { request } from '../../api';
import { useRouteState, useToast, useTransaction } from '../../hooks';
import { inTransferFlow } from '../../lib/steps';
import { errorMessage } from '../../lib/format';
import type { AchCreateResponse, CardCreateResponse, PaymentMethod, SyncResponse, User } from '../../types';

const TOKENIZER_SRC = 'https://cdn.simpleps.com/sandbox/inyo.js';
// Docs (tokenizing-cards, threeDSData): "redirect" sends successUrl/failUrl and the issuer sends the
// challenge tab there at the end (the BFF landing page reports back to this page); "postmessage" sends
// enablePostMessage and the result arrives as a window "message" (page URL registered with Inyo first);
// "off" tokenizes with enable:false and the challenge comes from POST /fundingAccounts (ActionRequired).
export type ThreeDsMode = 'off' | 'redirect' | 'postmessage';
const TOKENIZER_3DS_MODE: ThreeDsMode = 'off';
// successUrl/failUrl point at the page origin (e.g. http://localhost:3000): the issuer sends the user's
// browser there at the end of the challenge, so a local host works and APP_URL is not needed here.
const threeDsData = (mode: ThreeDsMode): NonNullable<InyoTokenizerOptions['threeDSData']> => {
    if (mode === 'redirect') {
        const origin = window.location.origin;
        return { enable: true, successUrl: `${origin}/api/3ds/success`, failUrl: `${origin}/api/3ds/fail` };
    }
    if (mode === 'postmessage') return { enable: true, enablePostMessage: true };
    return { enable: false };
};
const PLAID_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

const loadScript = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded) return resolve();
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', reject);
            return undefined;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => { script.dataset.loaded = '1'; resolve(); };
        script.onerror = reject;
        document.body.appendChild(script);
        return undefined;
    });

interface Billing {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zipcode: string;
}

const EMPTY_BILLING: Billing = { address1: '', address2: '', city: '', state: '', zipcode: '' };

export type View = 'list' | 'select-type' | 'add-card' | 'add-ach';
type CardField = 'pan' | 'expirationDate' | 'securitycode' | 'cardholder';
type CardErrors = Partial<Record<CardField, string>>;

export const GROUPS: Array<{ type: PaymentMethod['type']; title: string }> = [{ type: 'ACH', title: 'Bank accounts (ACH)' }, { type: 'CARD', title: 'Debit cards' }];
export const ADD_OPTIONS: Array<{ key: View; icon: typeof CreditCard; title: string; text: string; tone: string }> = [
    { key: 'add-card', icon: CreditCard, title: 'Debit card', text: 'Instant. May require a 3D Secure challenge.', tone: 'bg-brand-50 text-brand-600' },
    { key: 'add-ach', icon: Landmark, title: 'Bank account (ACH)', text: 'Lower fees. Linked with Plaid, settles in 1 to 3 business days.', tone: 'bg-info-50 text-info-600' },
];

export interface AddPaymentProps {
    user: User;
}

/**
 * Step 4: choose or add a funding account.
 *  - Cards are tokenized in the browser by inyo.js, then registered via POST /fundingAccounts.
 *    status "ActionRequired" opens the 3DS challenge (redirectAcsUrl) in an iframe; the result
 *    arrives through postMessage and is confirmed server-side (GET /payout/fundingAccounts/{id}).
 *  - ACH uses Plaid Link: link token from the BFF, then public_token + account_id to Inyo.
 */
export function useAddPayment({ user }: AddPaymentProps) {
    const navigate = useNavigate();
    const routeState = useRouteState<{ forceAdd?: boolean }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { transactionData, setTransactionData } = useTransaction();
    const inFlow = inTransferFlow(transactionData);

    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState<View>(routeState?.forceAdd ? 'select-type' : 'list');
    const [error, setError] = useState<string | null>(null);

    const [billing, setBilling] = useState<Billing>(EMPTY_BILLING);
    const [useProfileAddress, setUseProfileAddress] = useState(false);
    const [cardErrors, setCardErrors] = useState<CardErrors>({});
    const tokenizerRef = useRef<InyoTokenizerInstance | null>(null);
    const tokenizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // inyo.js registers a window "message" listener per instance and never removes it, so instances
    // created on earlier visits to this view keep firing GATEWAY_ERROR for unrelated postMessages.
    // Only the callbacks of a tokenization we started are honoured.
    const tokenizing = useRef(false);
    const errorRef = useRef<HTMLDivElement | null>(null);
    const billingRef = useRef(billing);
    billingRef.current = billing;

    // Bring the error into view: the add-card form is long and the message sits below it.
    useEffect(() => {
        if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [error]);

    const settleTokenizer = () => {
        if (tokenizeTimer.current) clearTimeout(tokenizeTimer.current);
        tokenizeTimer.current = null;
        tokenizing.current = false;
    };

    const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
    const [pendingCardId, setPendingCardId] = useState<string | null>(null);
    const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
    // Redirect mode runs the challenge in a separate tab: at the end the issuer navigates that whole
    // tab to successUrl/failUrl, which cannot happen inside an iframe. The tab is opened on the click
    // (before the async registration) so popup blockers allow it, then pointed at redirectAcsUrl.
    const [challengeTab, setChallengeTab] = useState(false);
    const challengeWin = useRef<Window | null>(null);
    const challengeOpen = !!challengeUrl || challengeTab;
    // Which 3DS mode the card is tokenized with (see THREE_DS_MODES above).
    const [threeDsMode, setThreeDsMode] = useState<ThreeDsMode>(TOKENIZER_3DS_MODE);
    const threeDsModeRef = useRef(threeDsMode);
    threeDsModeRef.current = threeDsMode;
    const [notice, setNotice] = useState<string | null>(null);

    const fetchMethods = useCallback(async () => {
        setLoading(true);
        try {
            setMethods(await request<PaymentMethod[]>('get', '/payment-methods'));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMethods(); }, [fetchMethods]);

    const handleSelect = (method: PaymentMethod) => {
        // Outside the send flow this page only manages funding accounts; nothing to select.
        if (!inFlow) {
            navigate('/payment-methods');
            return;
        }
        setTransactionData((prev) => ({ ...prev, paymentMethod: method }));
        navigate('/transaction/review');
    };

    /* ---------- Card: tokenizer ---------- */
    const registerCard = useCallback(async (tokenData: NonNullable<InyoTokenizerResponse['additionalData']>) => {
        setBusy(true);
        setError(null);
        try {
            const res = await request<CardCreateResponse>('post', '/payment-methods/cards', { token: tokenData, billingAddress: billingRef.current, threeDsMode: threeDsModeRef.current });
            if (res.status === 'ActionRequired' && res.redirectAcsUrl) {
                setPendingCardId(res.id);
                setPendingPaymentId(res.gatewayPaymentId || null);
                const win = challengeWin.current;
                if (win && !win.closed) {
                    win.location.replace(res.redirectAcsUrl);
                    setChallengeTab(true);
                } else if (threeDsModeRef.current === 'redirect') {
                    // Popup blocked or closed: fall back to a link the user can click.
                    setChallengeTab(true);
                    setChallengeUrl(null);
                    setNotice(`The challenge tab could not be opened automatically. Open it manually: ${res.redirectAcsUrl}`);
                } else {
                    setChallengeUrl(res.redirectAcsUrl);
                }
                return;
            }
            if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close();
            challengeWin.current = null;
            toast.success('Card added', `Status: ${res.status}`);
            await fetchMethods();
            setView('list');
        } catch (err) {
            if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close();
            challengeWin.current = null;
            const msg = errorMessage(err, 'Could not register the card');
            setError(msg);
            toast.error('Card not added', msg.length > 160 ? `${msg.slice(0, 160)}…` : msg);
        } finally {
            setBusy(false);
        }
    }, [fetchMethods, toast]);

    useEffect(() => {
        if (view !== 'add-card') return undefined;
        let disposed = false;
        const listeners: EventListenerOrEventListenerObject[] = [];
        loadScript(TOKENIZER_SRC)
            .then(() => {
                if (disposed || !window.InyoTokenizer) return;
                // Capture the window listeners inyo.js adds in its constructor so they can be removed on cleanup.
                const originalAdd = window.addEventListener;
                window.addEventListener = function (type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
                    if (type === 'message') listeners.push(fn);
                    return originalAdd.call(window, type, fn, opts);
                };
                try {
                    tokenizerRef.current = new window.InyoTokenizer({
                        targetId: '#payment-form-container',
                        storeLaterUse: true,
                        publicKey: import.meta.env.VITE_PUBLIC_KEY,
                        // With the tokenizer's own 3DS enabled, inyo.js expects a redirectUrl in the token
                        // response and raises GATEWAY_ERROR when there is none. See THREE_DS_MODES above.
                        threeDSData: threeDsData(threeDsMode),
                        // Docs: reasonCode WAITING_TRANSACTION + additionalData.token means the token is ready.
                        successCallback: (resp: InyoTokenizerResponse) => {
                            if (!tokenizing.current) return;
                            settleTokenizer();
                            if (resp.additionalData?.token) {
                                registerCard(resp.additionalData);
                            } else {
                                setBusy(false);
                                setError(`Tokenizer answered ${resp.reasonCode || resp.status || 'unknown'} without a token.`);
                            }
                        },
                        errorCallback: (resp: InyoTokenizerResponse) => {
                            if (!tokenizing.current) return;
                            if (resp.code === 'GATEWAY_ERROR') {
                                // inyo.js raises GATEWAY_ERROR from two places: its 3DS step when the token
                                // response has no redirectUrl, and its window "message" listener for any JSON
                                // postMessage that is not a 3DS success (fingerprint iframes, Plaid, ...). In
                                // both cases the token itself may already be minted (kept in tokenData). Hand
                                // it over and let Inyo drive 3DS; with no token yet, keep waiting for the
                                // real successCallback instead of aborting.
                                const data = tokenizerRef.current?.tokenData?.additionalData;
                                if (data?.token) {
                                    setNotice(`inyo.js reported GATEWAY_ERROR (${resp.message}): the card-token response carried no 3DS data (redirectUrl). The token ···· ${data.lastFourDigits || ''} was issued, so the sample continues and lets Inyo run 3DS.`);
                                    settleTokenizer();
                                    registerCard(data);
                                } else {
                                    setNotice(`inyo.js reported GATEWAY_ERROR (${resp.message}) before any token was issued. This comes from its window "message" listener reacting to an unrelated postMessage; still waiting for the card-token response.`);
                                    console.debug('inyo.js GATEWAY_ERROR before token', resp);
                                }
                                return;
                            }
                            settleTokenizer();
                            setBusy(false);
                            const map: Record<string, CardField> = { INVALID_PAN: 'pan', INVALID_EXPIRY_DATE: 'expirationDate', INVALID_CVV: 'securitycode', INVALID_CARDHOLDER: 'cardholder' };
                            const field = resp.code ? map[resp.code] : undefined;
                            setCardErrors(field ? { [field]: resp.message || resp.code } : {});
                            const msg = resp.message || resp.code || 'Card validation failed';
                            setError(resp.code && resp.code !== msg ? `${msg} (${resp.code})` : msg);
                            toast.error('Card not tokenized', msg);
                        },
                        });
                } finally {
                    window.addEventListener = originalAdd;
                }
            })
            .catch(() => setError('Could not load the Inyo tokenizer script. Check your network and VITE_PUBLIC_KEY.'));
        return () => {
            disposed = true;
            tokenizerRef.current = null;
            settleTokenizer();
            listeners.forEach((fn) => window.removeEventListener('message', fn));
            listeners.length = 0;
        };
    }, [view, registerCard, toast, threeDsMode]);

    const handleTokenize = () => {
        const required: Array<keyof Billing> = ['address1', 'city', 'state', 'zipcode'];
        const missing = required.filter((k) => !billing[k]);
        if (missing.length) {
            setError('Please complete the billing address.');
            return;
        }
        setError(null);
        setNotice(null);
        setCardErrors({});
        if (!tokenizerRef.current) {
            setError('Secure tokenizer is not ready yet.');
            return;
        }
        setBusy(true);
        if (threeDsMode === 'redirect') {
            // Must happen synchronously in the click handler, or the browser blocks the popup.
            const win = window.open('', '_blank');
            if (win) {
                win.document.write('<!doctype html><title>3D Secure</title><body style="font-family:system-ui;padding:24px;color:#1f2937"><p>Waiting for the card issuer… this tab will show the 3D Secure challenge if your card requires one.</p></body>');
                challengeWin.current = win;
            }
        }
        settleTokenizer();
        tokenizing.current = true;
        tokenizeTimer.current = setTimeout(() => {
            tokenizing.current = false;
            setBusy(false);
            if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close();
            challengeWin.current = null;
            setError('No answer from the tokenizer after 45 seconds. Check the card-token request in the browser network tab.');
        }, 45000);
        try {
            tokenizerRef.current.tokenizeCard();
        } catch (e) {
            settleTokenizer();
            setBusy(false);
            if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close();
            challengeWin.current = null;
            setError(`Tokenizer error: ${(e as Error).message}`);
        }
    };

    /* ---------- Card: 3DS result ---------- */
    const confirmCard = useCallback(async () => {
        if (!pendingCardId) return;
        try {
            const res = await request<SyncResponse>('get', `/payment-methods/${pendingCardId}/sync`);
            if (res.status === 'Verified') toast.success('Card verified', 'The card can now fund transfers.');
            else toast.warning(`Card status: ${res.status}`, 'Inyo has not confirmed the verification yet. Refresh later.');
        } catch (e) {
            toast.error('Could not confirm card status', errorMessage(e));
        } finally {
            setChallengeUrl(null);
            setChallengeTab(false);
            if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close();
            challengeWin.current = null;
            setPendingCardId(null);
            setPendingPaymentId(null);
            await fetchMethods();
            setView('list');
        }
    }, [pendingCardId, fetchMethods, toast]);

    // Docs (handling-3d-secure): in PostMessage mode the ACS page posts {paymentId, externalPaymentId,
    // amount, approved} to the parent window, only to pages whose URL Inyo registered beforehand. In
    // redirect mode the issuer sends the browser to successUrl/failUrl; those land on the BFF
    // (/api/3ds/*), which answers a page that relays the payload here from the app's own origin.
    // Whatever the payload says, the funding account status read from Inyo is what decides.
    useEffect(() => {
        if (!challengeOpen) return undefined;
        const onMessage = (event: MessageEvent) => {
            // Every message is logged while the modal is open, whatever its origin: the challenge page
            // posts to window.top with the targetOrigin the gateway holds for this payment, and a
            // mismatch is dropped silently by the browser, so seeing nothing here is itself a finding.
            console.debug('window message while 3DS modal open', event.origin, event.data);
            let data: unknown = event.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
            const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
            const relayed = obj?.source === 'remittance-sample-3ds' && event.origin === window.location.origin;
            if (!relayed && !/inyo\.global|simpleps\.com|inyoplatform\.com/.test(event.origin || '')) return;
            const payload: unknown = relayed ? { outcome: obj!.outcome, ...(obj!.payload as object) } : (obj?.response || data);
            if (!payload || typeof payload !== 'object') return;
            const p = payload as Record<string, unknown>;
            if (!relayed && !('approved' in p) && !p.paymentId && !p.id && !p.status) return;
            console.debug('3DS result received', payload);
            setNotice(`3DS result received ${relayed ? `via ${obj!.outcome}Url` : `from ${event.origin}`}: ${JSON.stringify(payload)}. Confirming the status with Inyo…`);
            confirmCard();
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [challengeOpen, confirmCard]);

    // While the challenge is open, poll Inyo (GET /fundingAccounts/{id} through the BFF sync) every
    // 5 s: the gateway reports the result to Inyo, so the status leaves ActionRequired there whatever
    // happens in the browser (postMessage, redirect or nothing). Stops after 10 minutes.
    useEffect(() => {
        if (!challengeOpen || !pendingCardId) return undefined;
        let stopped = false;
        const startedAt = Date.now();
        const tick = async () => {
            if (stopped) return;
            if (Date.now() - startedAt > 10 * 60 * 1000) { stopped = true; return; }
            try {
                const res = await request<SyncResponse>('get', `/payment-methods/${pendingCardId}/sync`);
                if (stopped) return;
                const status = String(res?.status || '').replace(/\s+/g, '').toLowerCase();
                if (status && status !== 'actionrequired' && status !== 'pending') {
                    setNotice(`Inyo now reports ${res.status} for this card.`);
                    confirmCard();
                }
            } catch {
                /* transient; try again on the next tick */
            }
        };
        const timer = setInterval(tick, 5000);
        return () => { stopped = true; clearInterval(timer); };
    }, [challengeOpen, pendingCardId, confirmCard]);

    // Redirect mode, top-level navigation: the challenge ran outside the iframe and the BFF sent the browser
    // back here (/payment?3ds=success|fail). The pending card id is gone with the page, so re-read the list.
    useEffect(() => {
        const outcome = searchParams.get('3ds');
        if (!outcome) return;
        setSearchParams((prev) => { prev.delete('3ds'); return prev; }, { replace: true });
        if (outcome === 'success') toast.success('3DS completed', 'Refreshing the funding accounts from Inyo…');
        else toast.warning('3DS failed', 'The card issuer did not authenticate the card.');
        fetchMethods();
    }, [searchParams, setSearchParams, toast, fetchMethods]);

    /* ---------- ACH: Plaid ---------- */
    const openPlaid = async () => {
        setBusy(true);
        setError(null);
        try {
            await loadScript(PLAID_SRC);
            const { token } = await request<{ token: string }>('post', '/payment-methods/ach/link-token');
            const handler = window.Plaid!.create({
                token,
                onSuccess: async (public_token, metadata) => {
                    try {
                        setBusy(true);
                        const res = await request<AchCreateResponse>('post', '/payment-methods/ach', {
                            bankData: { accountCheckToken: public_token, accountCheckId: metadata.accounts?.[0]?.id, nickname: metadata.institution?.name || 'Bank account' },
                        });
                        toast.success('Bank account linked', `Status: ${res.status}. ACH accounts become usable once Verified.`);
                        await fetchMethods();
                        setView('list');
                    } catch (err) {
                        setError(errorMessage(err, 'Could not register the bank account'));
                    } finally {
                        setBusy(false);
                    }
                },
                onExit: (err) => {
                    setBusy(false);
                    if (err) setError(err.display_message || err.error_message || 'Plaid Link was closed with an error.');
                },
            });
            setBusy(false);
            handler.open();
        } catch (err) {
            setBusy(false);
            setError(errorMessage(err, 'Could not start Plaid Link'));
        }
    };

    const applyProfileAddress = (checked: boolean) => {
        setUseProfileAddress(checked);
        setBilling(checked ? { address1: user.address || '', address2: '', city: user.city || '', state: user.state || '', zipcode: user.zipcode || '' } : EMPTY_BILLING);
    };
    const onBilling = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setBilling({ ...billing, [e.target.name]: e.target.value });

    const titles: Record<View, [string, string]> = {
        list: ['Payment options', inFlow ? 'Choose how to pay for this transfer.' : 'Choose a funding account to manage.'],
        'select-type': ['Add payment method', 'Both are registered as Inyo funding accounts in USD.'],
        'add-card': ['Add a debit card', 'Card data is tokenized in your browser by inyo.js and never touches this server.'],
        'add-ach': ['Link a bank account', 'Verified through Plaid Link. Routing and account numbers are never sent to Inyo directly.'],
    };
    const [title, description] = titles[view];

    /* ---------- view navigation ---------- */
    const showSelectType = () => setView('select-type');
    const chooseType = (key: View) => { setError(null); setView(key); };
    const cancelSelectType = () => (methods.length ? setView('list') : navigate(-1));
    const backToDelivery = () => navigate(transactionData.beneficiary ? `/beneficiaries/${transactionData.beneficiary.id}/account` : '/beneficiaries');
    const backToSelectType = () => setView('select-type');
    const onThreeDsMode = (e: ChangeEvent<HTMLSelectElement>) => setThreeDsMode(e.target.value as ThreeDsMode);
    const closeChallengeTab = () => { setChallengeTab(false); if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close(); challengeWin.current = null; setPendingCardId(null); setPendingPaymentId(null); fetchMethods(); };
    const focusChallengeTab = () => { const w = challengeWin.current; if (w && !w.closed) w.focus(); };
    const closeChallengeIframe = () => { setChallengeUrl(null); setPendingCardId(null); setPendingPaymentId(null); fetchMethods(); };

    return {
        inFlow, methods, loading, busy, view, error, errorRef, billing, useProfileAddress, cardErrors,
        challengeUrl, challengeTab, pendingPaymentId, threeDsMode, notice, title, description,
        handleSelect, handleTokenize, confirmCard, openPlaid, applyProfileAddress, onBilling, onThreeDsMode,
        showSelectType, chooseType, cancelSelectType, backToDelivery, backToSelectType, closeChallengeTab, focusChallengeTab, closeChallengeIframe,
    };
}

export type AddPaymentViewProps = ReturnType<typeof useAddPayment>;
