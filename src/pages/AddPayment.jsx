import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, Landmark, Lock, Plus, ShieldCheck, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../components/ui/Card';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../lib/toast';
import PaymentMethodCard from '../components/PaymentMethodCard';
import { request } from '../api';
import { TransactionContext } from '../context/transaction';
import { inTransferFlow } from '../lib/steps';
import { errorMessage } from '../lib/format';
import { US_STATES } from '../lib/usStates';
import { cx } from '../lib/cx';

const TOKENIZER_SRC = 'https://cdn.simpleps.com/sandbox/inyo.js';
// Docs (tokenizing-cards, threeDSData): "redirect" sends successUrl/failUrl and the issuer sends the
// challenge tab there at the end (the BFF landing page reports back to this page); "postmessage" sends
// enablePostMessage and the result arrives as a window "message" (page URL registered with Inyo first);
// "off" tokenizes with enable:false and the challenge comes from POST /fundingAccounts (ActionRequired).
const TOKENIZER_3DS_MODE = 'off';
// successUrl/failUrl point at the page origin (e.g. http://localhost:3000): the issuer sends the user's
// browser there at the end of the challenge, so a local host works and APP_URL is not needed here.
const threeDsData = (mode) => {
    if (mode === 'redirect') {
        const origin = window.location.origin;
        return { enable: true, successUrl: `${origin}/api/3ds/success`, failUrl: `${origin}/api/3ds/fail` };
    }
    if (mode === 'postmessage') return { enable: true, enablePostMessage: true };
    return { enable: false };
};
const PLAID_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

const loadScript = (src) =>
    new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
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

const EMPTY_BILLING = { address1: '', address2: '', city: '', state: '', zipcode: '' };

/**
 * Step 4: choose or add a funding account.
 *  - Cards are tokenized in the browser by inyo.js, then registered via POST /fundingAccounts.
 *    status "ActionRequired" opens the 3DS challenge (redirectAcsUrl) in an iframe; the result
 *    arrives through postMessage and is confirmed server-side (GET /payout/fundingAccounts/{id}).
 *  - ACH uses Plaid Link: link token from the BFF, then public_token + account_id to Inyo.
 */
const AddPayment = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { transactionData, setTransactionData } = useContext(TransactionContext);
    const inFlow = inTransferFlow(transactionData);

    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState(location.state?.forceAdd ? 'select-type' : 'list');
    const [error, setError] = useState(null);

    const [billing, setBilling] = useState(EMPTY_BILLING);
    const [useProfileAddress, setUseProfileAddress] = useState(false);
    const [cardErrors, setCardErrors] = useState({});
    const tokenizerRef = useRef(null);
    const tokenizeTimer = useRef(null);
    // inyo.js registers a window "message" listener per instance and never removes it, so instances
    // created on earlier visits to this view keep firing GATEWAY_ERROR for unrelated postMessages.
    // Only the callbacks of a tokenization we started are honoured.
    const tokenizing = useRef(false);
    const errorRef = useRef(null);
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

    const [challengeUrl, setChallengeUrl] = useState(null);
    const [pendingCardId, setPendingCardId] = useState(null);
    const [pendingPaymentId, setPendingPaymentId] = useState(null);
    // Redirect mode runs the challenge in a separate tab: at the end the issuer navigates that whole
    // tab to successUrl/failUrl, which cannot happen inside an iframe. The tab is opened on the click
    // (before the async registration) so popup blockers allow it, then pointed at redirectAcsUrl.
    const [challengeTab, setChallengeTab] = useState(false);
    const challengeWin = useRef(null);
    const challengeOpen = !!challengeUrl || challengeTab;
    // Which 3DS mode the card is tokenized with (see THREE_DS_MODES above).
    const [threeDsMode, setThreeDsMode] = useState(TOKENIZER_3DS_MODE);
    const threeDsModeRef = useRef(threeDsMode);
    threeDsModeRef.current = threeDsMode;
    const [notice, setNotice] = useState(null);

    const fetchMethods = useCallback(async () => {
        setLoading(true);
        try {
            setMethods(await request('get', '/payment-methods'));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMethods(); }, [fetchMethods]);

    const handleSelect = (method) => {
        // Outside the send flow this page only manages funding accounts; nothing to select.
        if (!inFlow) {
            navigate('/payment-methods');
            return;
        }
        setTransactionData((prev) => ({ ...prev, paymentMethod: method }));
        navigate('/transaction/review');
    };

    /* ---------- Card: tokenizer ---------- */
    const registerCard = useCallback(async (tokenData) => {
        setBusy(true);
        setError(null);
        try {
            const res = await request('post', '/payment-methods/cards', { token: tokenData, billingAddress: billingRef.current, threeDsMode: threeDsModeRef.current });
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
        const listeners = [];
        loadScript(TOKENIZER_SRC)
            .then(() => {
                if (disposed || !window.InyoTokenizer) return;
                // Capture the window listeners inyo.js adds in its constructor so they can be removed on cleanup.
                const originalAdd = window.addEventListener;
                window.addEventListener = function (type, fn, opts) {
                    if (type === 'message') listeners.push(fn);
                    return originalAdd.call(this, type, fn, opts);
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
                        successCallback: (resp) => {
                            if (!tokenizing.current) return;
                            settleTokenizer();
                            if (resp.additionalData?.token) {
                                registerCard(resp.additionalData);
                            } else {
                                setBusy(false);
                                setError(`Tokenizer answered ${resp.reasonCode || resp.status || 'unknown'} without a token.`);
                            }
                        },
                        errorCallback: (resp) => {
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
                            const map = { INVALID_PAN: 'pan', INVALID_EXPIRY_DATE: 'expirationDate', INVALID_CVV: 'securitycode', INVALID_CARDHOLDER: 'cardholder' };
                            setCardErrors(map[resp.code] ? { [map[resp.code]]: resp.message || resp.code } : {});
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
        const required = ['address1', 'city', 'state', 'zipcode'];
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
            setError(`Tokenizer error: ${e.message}`);
        }
    };

    /* ---------- Card: 3DS result ---------- */
    const confirmCard = useCallback(async () => {
        if (!pendingCardId) return;
        try {
            const res = await request('get', `/payment-methods/${pendingCardId}/sync`);
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
        const onMessage = (event) => {
            // Every message is logged while the modal is open, whatever its origin: the challenge page
            // posts to window.top with the targetOrigin the gateway holds for this payment, and a
            // mismatch is dropped silently by the browser, so seeing nothing here is itself a finding.
            console.debug('window message while 3DS modal open', event.origin, event.data);
            let data = event.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
            const relayed = data?.source === 'remittance-sample-3ds' && event.origin === window.location.origin;
            if (!relayed && !/inyo\.global|simpleps\.com|inyoplatform\.com/.test(event.origin || '')) return;
            const payload = relayed ? { outcome: data.outcome, ...data.payload } : (data?.response || data);
            if (!payload || typeof payload !== 'object') return;
            if (!relayed && !('approved' in payload) && !payload.paymentId && !payload.id && !payload.status) return;
            console.debug('3DS result received', payload);
            setNotice(`3DS result received ${relayed ? `via ${data.outcome}Url` : `from ${event.origin}`}: ${JSON.stringify(payload)}. Confirming the status with Inyo…`);
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
                const res = await request('get', `/payment-methods/${pendingCardId}/sync`);
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
            const { token } = await request('post', '/payment-methods/ach/link-token');
            const handler = window.Plaid.create({
                token,
                onSuccess: async (public_token, metadata) => {
                    try {
                        setBusy(true);
                        const res = await request('post', '/payment-methods/ach', {
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

    const applyProfileAddress = (checked) => {
        setUseProfileAddress(checked);
        setBilling(checked ? { address1: user.address || '', address2: '', city: user.city || '', state: user.state || '', zipcode: user.zipcode || '' } : EMPTY_BILLING);
    };
    const onBilling = (e) => setBilling({ ...billing, [e.target.name]: e.target.value });

    const titles = {
        list: ['Payment options', inFlow ? 'Choose how to pay for this transfer.' : 'Choose a funding account to manage.'],
        'select-type': ['Add payment method', 'Both are registered as Inyo funding accounts in USD.'],
        'add-card': ['Add a debit card', 'Card data is tokenized in your browser by inyo.js and never touches this server.'],
        'add-ach': ['Link a bank account', 'Verified through Plaid Link. Routing and account numbers are never sent to Inyo directly.'],
    };

    return (
        <div>
            <PageHeader
                kicker={inFlow ? 'Step 4 of 5' : 'Account'}
                title={titles[view][0]}
                description={titles[view][1]}
                actions={view === 'list' ? <Button icon={Plus} variant={methods.length ? 'secondary' : 'primary'} onClick={() => setView('select-type')}>Add new</Button> : null}
            />

            {error && view !== 'add-card' && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading payment methods…" />
            ) : view === 'list' ? (
                methods.length === 0 ? (
                    <EmptyState icon={CreditCard} title="No payment method yet" description="Add a debit card or link a bank account to fund your transfer." action={<Button icon={Plus} onClick={() => setView('select-type')}>Add payment method</Button>} />
                ) : (
                    <div className="space-y-8">
                        {[{ type: 'ACH', title: 'Bank accounts (ACH)' }, { type: 'CARD', title: 'Debit cards' }].map(({ type, title }) => {
                            const items = methods.filter((m) => m.type === type);
                            if (!items.length) return null;
                            return (
                                <section key={type}>
                                    <p className="kicker mb-3">{title}</p>
                                    <ul className="grid gap-3 sm:grid-cols-2">
                                        {items.map((m) => <li key={m.id}><PaymentMethodCard method={m} onSelect={handleSelect} /></li>)}
                                    </ul>
                                </section>
                            );
                        })}
                        <p className="text-xs text-ink-400">Only methods with status Verified can be selected. Pending ACH accounts become usable after Plaid verification.</p>
                        {inFlow && (
                            <div>
                                <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(transactionData.beneficiary ? `/beneficiaries/${transactionData.beneficiary.id}/account` : '/beneficiaries')}>Back</Button>
                            </div>
                        )}
                    </div>
                )
            ) : view === 'select-type' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    {[
                        { key: 'add-card', icon: CreditCard, title: 'Debit card', text: 'Instant. May require a 3D Secure challenge.', tone: 'bg-brand-50 text-brand-600' },
                        { key: 'add-ach', icon: Landmark, title: 'Bank account (ACH)', text: 'Lower fees. Linked with Plaid, settles in 1 to 3 business days.', tone: 'bg-info-50 text-info-600' },
                    ].map(({ key, icon: Icon, title, text, tone }) => (
                        <button key={key} type="button" onClick={() => { setError(null); setView(key); }} className="card group flex flex-col items-start p-6 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20">
                            <div className={cx('mb-4 flex size-12 items-center justify-center rounded-2xl', tone)}><Icon className="size-6" /></div>
                            <p className="text-lg font-semibold text-ink-900">{title}</p>
                            <p className="mt-1 text-sm text-ink-500">{text}</p>
                        </button>
                    ))}
                    <div className="sm:col-span-2">
                        <Button variant="ghost" icon={ArrowLeft} onClick={() => (methods.length ? setView('list') : navigate(-1))}>Cancel</Button>
                    </div>
                </div>
            ) : view === 'add-card' ? (
                <Card>
                    <CardBody className="space-y-8">
                        <section>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="font-semibold text-ink-900">Billing address</h3>
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-500">
                                    <input type="checkbox" checked={useProfileAddress} onChange={(e) => applyProfileAddress(e.target.checked)} className="size-4 accent-brand-600" />
                                    Use my address on file
                                </label>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field name="address1" label="Address line 1" value={billing.address1} onChange={onBilling} required placeholder="123 Market St" />
                                <Field name="address2" label="Address line 2" value={billing.address2} onChange={onBilling} placeholder="Apt, suite (optional)" />
                                <Field name="city" label="City" value={billing.city} onChange={onBilling} required />
                                <div className="grid grid-cols-[1fr_0.8fr] gap-4">
                                    <Field name="state" label="State" value={billing.state} onChange={onBilling} options={US_STATES} required placeholder="Select" />
                                    <Field name="zipcode" label="ZIP code" value={billing.zipcode} onChange={onBilling} required placeholder="94105" />
                                </div>
                            </div>
                        </section>

                        <section id="payment-form-container">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-ink-900">Card details</h3>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700"><Lock className="size-3" /> Tokenized by inyo.js</span>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-medium text-ink-500" title="redirect: threeDSData.successUrl/failUrl point at this app and the challenge opens in a new tab. postmessage: threeDSData.enablePostMessage, result arrives as a window message (page URL registered with Inyo). off: enable:false, the challenge comes from POST /fundingAccounts (ActionRequired + redirectAcsUrl).">
                                    3DS in tokenizer
                                    <select value={threeDsMode} disabled={busy} onChange={(e) => setThreeDsMode(e.target.value)} className="field-control h-8 w-auto py-0 text-xs">
                                        <option value="off">off (core drives 3DS)</option>
                                        <option value="redirect">redirect (successUrl/failUrl)</option>
                                        <option value="postmessage">postMessage</option>
                                    </select>
                                </label>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field name="cc-name" label="Name on card" error={cardErrors.cardholder}>
                                    <input id="cc-name" data-field="cardholder" className="field-control" placeholder="Jane Doe" autoComplete="cc-name" aria-invalid={!!cardErrors.cardholder} />
                                </Field>
                                <Field name="cc-number" label="Debit card number" error={cardErrors.pan}>
                                    <input id="cc-number" data-field="pan" className="field-control font-mono" placeholder="0000 0000 0000 0000" maxLength={19} inputMode="numeric" autoComplete="cc-number" aria-invalid={!!cardErrors.pan} />
                                </Field>
                                <Field name="cc-expiration" label="Expiration" error={cardErrors.expirationDate}>
                                    <input id="cc-expiration" data-field="expirationDate" className="field-control font-mono" placeholder="MM/YY" maxLength={5} inputMode="numeric" autoComplete="cc-exp" aria-invalid={!!cardErrors.expirationDate} />
                                </Field>
                                <Field name="cc-cvv" label="CVV" error={cardErrors.securitycode}>
                                    <input id="cc-cvv" data-field="securitycode" className="field-control font-mono" placeholder="123" maxLength={4} inputMode="numeric" autoComplete="cc-csc" aria-invalid={!!cardErrors.securitycode} />
                                </Field>
                            </div>
                            {threeDsMode === 'redirect' && (
                                <p className="mt-3 text-xs text-ink-400">
                                    threeDSData.successUrl = {window.location.origin}/api/3ds/success, failUrl = {window.location.origin}/api/3ds/fail.
                                </p>
                            )}
                            <p className="mt-3 text-xs text-ink-400">
                                Sandbox: 5163613613613613 (Mastercard debit) has no 3DS, 4462030000000000 triggers a 3DS challenge, 4035874000424977 is frictionless, 4000000000000002 is declined. Any future expiry; CVV 555 simulates a match.{' '}
                                <a href="https://dev.inyoglobal.com/api-references/payments-gateway/apis/test-data/cards/" target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline-offset-2 hover:underline">
                                    Full list of test cards, CVV and AVS codes
                                </a>
                                .
                            </p>
                        </section>

                        {notice && <Alert tone="warning" title="Tokenizer notice">{notice}</Alert>}
                        {error && (
                            <div ref={errorRef}>
                                <Alert tone="danger" title="Card not added">{error}</Alert>
                            </div>
                        )}
                        {busy && !error && <p className="text-sm text-ink-500" role="status">Tokenizing the card with inyo.js and registering it with Inyo…</p>}
                    </CardBody>
                    <CardFooter>
                        <Button variant="ghost" icon={ArrowLeft} disabled={busy} onClick={() => setView('select-type')}>Back</Button>
                        <Button icon={ShieldCheck} loading={busy} onClick={handleTokenize}>{busy ? 'Adding card…' : 'Add card'}</Button>
                    </CardFooter>
                </Card>
            ) : (
                <Card>
                    <CardBody>
                        <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-6 py-10 text-center">
                            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-info-50 text-info-600"><Landmark className="size-6" /></div>
                            <p className="font-semibold text-ink-900">Connect with Plaid</p>
                            <p className="mt-1 max-w-sm text-sm text-ink-500">Your bank credentials go to Plaid only. Inyo receives a verification token and the selected account id.</p>
                            <Button className="mt-5" loading={busy} onClick={openPlaid}>Open Plaid Link</Button>
                            <p className="mt-3 text-xs text-ink-400">Sandbox tip: institution “First Platypus Bank”, user_good / pass_good.</p>
                        </div>
                    </CardBody>
                    <CardFooter>
                        <Button variant="ghost" icon={ArrowLeft} onClick={() => setView('select-type')}>Back</Button>
                        <span />
                    </CardFooter>
                </Card>
            )}

            <Modal
                open={challengeTab}
                size="md"
                title="3D Secure verification in a new tab"
                description="Complete the challenge from your card issuer in the tab that just opened. In redirect mode the issuer sends that tab to the app's successUrl or failUrl, which reports back here and closes it."
                onClose={() => { setChallengeTab(false); if (challengeWin.current && !challengeWin.current.closed) challengeWin.current.close(); challengeWin.current = null; setPendingCardId(null); setPendingPaymentId(null); fetchMethods(); }}
            >
                <div className="space-y-4 px-6 py-5">
                    <p className="text-sm text-ink-600">
                        Waiting for the challenge{pendingPaymentId ? <> (gateway payment <code>{pendingPaymentId}</code>)</> : null}. This page also re-reads the card from Inyo every 5 seconds, so it closes as soon as Inyo reports the result, whatever happens in the other tab.
                    </p>
                    {notice && <Alert tone="warning" title="Notice">{notice}</Alert>}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={confirmCard}>I completed the challenge, check status</Button>
                        <Button size="sm" variant="ghost" onClick={() => { const w = challengeWin.current; if (w && !w.closed) w.focus(); }}>Go to the challenge tab</Button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={!!challengeUrl}
                size="lg"
                title="3D Secure verification"
                description="Complete the challenge from your card issuer. The result is confirmed with Inyo before the card is enabled."
                onClose={() => { setChallengeUrl(null); setPendingCardId(null); setPendingPaymentId(null); fetchMethods(); }}
            >
                <iframe src={challengeUrl || 'about:blank'} title="3D Secure challenge" className="h-[55vh] w-full bg-white" />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-6 py-4">
                    <p className="max-w-xl text-xs text-ink-500">
                        After the code, the issuer reports the result to Inyo; the frame itself may stay on <em>Redirecting…</em> or <em>Loading…</em>. This dialog re-reads the card from Inyo every 5 seconds and closes as soon as the status leaves <em>ActionRequired</em>{pendingPaymentId ? <> (gateway payment <code>{pendingPaymentId}</code>)</> : null}. You can also check it manually.
                    </p>
                    <Button size="sm" variant="secondary" icon={RefreshCw} onClick={confirmCard}>I completed the challenge, check status</Button>
                </div>
            </Modal>
        </div>
    );
};

export default AddPayment;
