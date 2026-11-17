import { Link } from 'react-router-dom';
import { CreditCard, ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';
import PaymentMethodCard from '../../components/PaymentMethodCard';
import WebhookPanel from '../../components/WebhookPanel';
import { challengeUrl as challengeUrlOf, isUsable, needsChallenge } from '../../lib/paymentMethods';
import { GROUPS, type PaymentMethodsViewProps } from './model';

export default function PaymentMethodsView({ methods, loading, error, syncing, removing, challenge, sync, remove, reload, resumeChallenge, resumeChallengeInTab, closeChallenge, checkChallenge }: PaymentMethodsViewProps) {
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
                    {GROUPS.map(({ type, title }) => {
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
                                                            <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => resumeChallenge(m)}>Resume 3DS</Button>
                                                            <Button size="sm" variant="ghost" icon={ExternalLink} title="Redirect mode: the issuer sends the whole tab to the app's successUrl/failUrl at the end, which only works outside an iframe." onClick={() => resumeChallengeInTab(m)}>Resume in a new tab</Button>
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
                onClose={closeChallenge}
            >
                {challenge?.tab ? (
                    <p className="px-6 py-5 text-sm text-ink-600">The challenge is running in the tab that just opened. At the end the issuer sends that tab to the app's <code>successUrl</code>/<code>failUrl</code>, which reports back here and closes it. You can also check the status manually below.</p>
                ) : (
                    <iframe src={challenge?.url || 'about:blank'} title="3D Secure challenge" className="h-[55vh] w-full bg-white" />
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-6 py-4">
                    <p className="max-w-xl text-xs text-ink-500">If the frame stays on <em>Loading…</em> after the code, the issuer page is waiting for the gateway's webhook; nothing more happens on this side. Check the status manually: it only becomes Verified once that webhook reaches Inyo. If the page says <em>Token not found or expired</em>, the challenge window has closed and Inyo offers no way to reissue it: remove this card and add it again.</p>
                    <Button size="sm" variant="secondary" icon={RefreshCw} loading={!!syncing} onClick={checkChallenge}>I completed the challenge, check status</Button>
                </div>
            </Modal>
        </div>
    );
}
