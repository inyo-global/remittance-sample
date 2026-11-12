import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2, Webhook } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';
import PaymentMethodCard from '../components/PaymentMethodCard';
import { request } from '../api';
import { errorMessage } from '../lib/format';
import { useToast } from '../lib/toast';
import { challengeUrl as challengeUrlOf, isUsable, needsChallenge } from '../lib/paymentMethods';

/**
 * Gateway notification panel (optional): the public URL where the gateway can report card verification
 * results, and the events received so far. AUTHORIZED / DECLINED update the matching card locally;
 * Inyo remains the source of truth, so "Check status" may disagree until Inyo reports the same result.
 */
function WebhookPanel({ onEvent }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const lastId = React.useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await request('get', '/webhooks/events');
            setInfo(res);
            const newest = res.events?.[0]?.id ?? null;
            if (lastId.current !== null && newest !== null && newest !== lastId.current) onEvent?.();
            lastId.current = newest;
        } catch { /* panel is informational */ } finally { setLoading(false); }
    }, [onEvent]);

    useEffect(() => {
        load();
        const timer = setInterval(load, 10000);
        return () => clearInterval(timer);
    }, [load]);

    const url = info?.publicUrl ? `${info.publicUrl}${info.path}` : null;
    return (
        <Card className="mt-10">
            <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="flex items-center gap-2 font-semibold text-ink-900"><Webhook className="size-4 text-brand-600" /> Gateway notification (optional)</h3>
                        <p className="mt-1 text-sm text-ink-500">
                            If Inyo configures the gateway's card-verification notification for this backend (<code>status</code> AUTHORIZED or DECLINED), events arrive here and update the matching card. Inyo remains the source of truth for the card status.
                        </p>
                    </div>
                    <Button size="sm" variant="ghost" icon={RefreshCw} loading={loading} onClick={load}>Refresh</Button>
                </div>
                <p className="mt-3 break-all rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700">
                    POST {url || `${window.location.origin.replace(':3000', ':3001')}${info?.path || '/api/webhooks/gateway'} (no public URL detected; expose the BFF with a tunnel)`}
                    {info?.basicAuth ? ' · Basic Auth required' : ' · no auth'}
                </p>
                {info?.events?.length ? (
                    <ul className="mt-4 divide-y divide-ink-100 text-sm">
                        {info.events.slice(0, 8).map((e) => (
                            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                <span className="font-mono text-xs text-ink-400">{e.receivedAt?.replace('T', ' ').slice(0, 19)}</span>
                                <span className="font-semibold text-ink-900">{e.status || '?'}</span>
                                <span className="font-mono text-xs text-ink-500">{e.externalPaymentId || e.paymentId || '—'}</span>
                                <span className="text-xs text-ink-500">{e.matchedCardId ? 'matched a card' : 'no matching card'}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-4 text-sm text-ink-400">No events received yet.</p>
                )}
            </CardBody>
        </Card>
    );
}

const PaymentMethods = ({ user }) => {
    const toast = useToast();
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [syncing, setSyncing] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [challenge, setChallenge] = useState(null); // { method, url, tab?: Window }

    const load = useCallback(() => request('get', '/payment-methods'), []);
    const reload = useCallback(() => { load().then(setMethods).catch(() => {}); }, [load]);

    useEffect(() => {
        let cancelled = false;
        load()
            .then((res) => !cancelled && setMethods(res))
            .catch((err) => !cancelled && setError(errorMessage(err)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [user?.userId, load]);

    // GET /fundingAccounts/{id} through the BFF: the core is the source of truth for the status.
    const sync = useCallback(async (method) => {
        setSyncing(method.id);
        try {
            const res = await request('get', `/payment-methods/${method.id}/sync`);
            const status = res.status || res.data?.status;
            setMethods(await load());
            if (/^verified$/i.test(status)) toast.success('Card verified', 'The card can now fund transfers.');
            else if (/^rejected$/i.test(status)) toast.error('Card rejected', res.data?.statusMessage || 'The issuer declined the verification.');
            else toast.warning(`Status: ${status}`, 'Inyo has not confirmed the challenge result yet; try again in a moment.');
        } catch (err) {
            toast.error('Could not refresh status', errorMessage(err));
        } finally {
            setSyncing(null);
        }
    }, [load, toast]);

    // DELETE /fundingAccounts/{id} through the BFF: soft, one-way deactivation on Inyo (isActive=false).
    const remove = useCallback(async (method) => {
        const label = method.type === 'ACH' ? 'this bank account' : `the card ending in ${method.token?.lastFourDigits || method.data?.apiResponse?.lastFourDigits || '····'}`;
        if (!window.confirm(`Remove ${label}? Inyo deactivates it permanently; there is no reactivation.`)) return;
        setRemoving(method.id);
        try {
            await request('delete', `/payment-methods/${method.id}`);
            setMethods(await load());
            toast.success('Payment method removed', 'Deactivated on Inyo (isActive: false).');
        } catch (err) {
            toast.error('Could not remove it', errorMessage(err));
        } finally {
            setRemoving(null);
        }
    }, [load, toast]);

    // Result of the ACS page (docs: {paymentId, externalPaymentId, amount, approved}); any result triggers a sync.
    useEffect(() => {
        if (!challenge) return undefined;
        const onMessage = (event) => {
            let data = event.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
            // Redirect mode: the landing page (/api/3ds/success|fail, same origin) reports from the new tab.
            const relayed = data?.source === 'remittance-sample-3ds' && event.origin === window.location.origin;
            if (!relayed && !/inyo\.global|simpleps\.com|inyoplatform\.com/.test(event.origin || '')) return;
            const payload = relayed ? data.payload : (data?.response || data);
            if (!relayed && (!payload || typeof payload !== 'object' || (!('approved' in payload) && !payload.paymentId && !payload.id && !payload.status))) return;
            const m = challenge.method;
            if (challenge.tab && !challenge.tab.closed) challenge.tab.close();
            setChallenge(null);
            sync(m);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [challenge, sync]);

    const groups = [
        { type: 'ACH', title: 'Bank accounts (ACH)' },
        { type: 'CARD', title: 'Debit cards' },
    ];

    return (
        <div>
            <PageHeader
                kicker="Account"
                title="Payment methods"
                description="Funding accounts registered with Inyo. Only verified methods can fund a transfer."
                actions={<Button as={Link} to="/payment" state={{ forceAdd: true }} icon={Plus}>Add payment method</Button>}
            />

            {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading payment methods…" />
            ) : methods.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payment methods yet" description="Add a debit card (tokenized in the browser) or link a US bank account through Plaid." action={<Button as={Link} to="/payment" state={{ forceAdd: true }} icon={Plus}>Add payment method</Button>} />
            ) : (
                <div className="space-y-8">
                    {groups.map(({ type, title }) => {
                        const items = methods.filter((m) => m.type === type);
                        if (!items.length) return null;
                        return (
                            <section key={type}>
                                <p className="kicker mb-3">{title}</p>
                                <ul className="grid gap-3 sm:grid-cols-2">
                                    {items.map((m) => (
                                        <li key={m.id}>
                                            <PaymentMethodCard method={m}>
                                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                                    {m.type === 'CARD' && needsChallenge(m) && challengeUrlOf(m) && (
                                                        <>
                                                            <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => setChallenge({ method: m, url: challengeUrlOf(m) })}>Resume 3DS</Button>
                                                            <Button size="sm" variant="ghost" icon={ExternalLink} title="Redirect mode: the issuer sends the whole tab to the app's successUrl/failUrl at the end, which only works outside an iframe." onClick={() => { const tab = window.open(challengeUrlOf(m), '_blank'); setChallenge({ method: m, url: challengeUrlOf(m), tab }); }}>Resume in a new tab</Button>
                                                        </>
                                                    )}
                                                    {m.type === 'CARD' && !isUsable(m) && (
                                                        <Button size="sm" variant="ghost" icon={RefreshCw} loading={syncing === m.id} onClick={() => sync(m)}>Check status</Button>
                                                    )}
                                                    <Button size="sm" variant="ghost" icon={Trash2} loading={removing === m.id} onClick={() => remove(m)} className="text-danger-600 hover:bg-danger-50">Remove</Button>
                                                </div>
                                            </PaymentMethodCard>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}

            <WebhookPanel onEvent={reload} />

            <Modal
                open={!!challenge}
                size="lg"
                title="3D Secure verification"
                description="Complete the challenge from your card issuer. The gateway reports the result to Inyo, and the status below is read from Inyo."
                onClose={() => { if (challenge?.tab && !challenge.tab.closed) challenge.tab.close(); setChallenge(null); }}
            >
                {challenge?.tab ? (
                    <p className="px-6 py-5 text-sm text-ink-600">The challenge is running in the tab that just opened. At the end the issuer sends that tab to the app's <code>successUrl</code>/<code>failUrl</code>, which reports back here and closes it. You can also check the status manually below.</p>
                ) : (
                    <iframe src={challenge?.url || 'about:blank'} title="3D Secure challenge" className="h-[55vh] w-full bg-white" />
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-6 py-4">
                    <p className="max-w-xl text-xs text-ink-500">If the frame stays on <em>Loading…</em> after the code, the issuer page is waiting for the gateway's webhook; nothing more happens on this side. Check the status manually: it only becomes Verified once that webhook reaches Inyo. If the page says <em>Token not found or expired</em>, the challenge window has closed and Inyo offers no way to reissue it: remove this card and add it again.</p>
                    <Button size="sm" variant="secondary" icon={RefreshCw} loading={!!syncing} onClick={() => { const m = challenge.method; setChallenge(null); sync(m); }}>I completed the challenge, check status</Button>
                </div>
            </Modal>
        </div>
    );
};

export default PaymentMethods;
