import { ArrowLeft, CreditCard, Landmark, Lock, Plus, ShieldCheck, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import PaymentMethodCard from '../../components/PaymentMethodCard';
import { US_STATES } from '../../lib/usStates';
import { cx } from '../../lib/cx';
import { ADD_OPTIONS, GROUPS, type AddPaymentViewProps } from './model';

export default function AddPaymentView({
    inFlow, methods, loading, busy, view, error, errorRef, billing, useProfileAddress, cardErrors,
    challengeUrl, challengeTab, pendingPaymentId, threeDsMode, notice, title, description,
    handleSelect, handleTokenize, confirmCard, openPlaid, applyProfileAddress, onBilling, onThreeDsMode,
    showSelectType, chooseType, cancelSelectType, backToDelivery, backToSelectType, closeChallengeTab, focusChallengeTab, closeChallengeIframe,
}: AddPaymentViewProps) {
    return (
        <div>
            <PageHeader
                kicker={inFlow ? 'Step 4 of 5' : 'Account'}
                title={title}
                description={description}
                actions={view === 'list' ? <Button icon={Plus} variant={methods.length ? 'secondary' : 'primary'} onClick={showSelectType}>Add new</Button> : null}
            />

            {error && view !== 'add-card' && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading payment methods…" />
            ) : view === 'list' ? (
                methods.length === 0 ? (
                    <EmptyState icon={CreditCard} title="No payment method yet" description="Add a debit card or link a bank account to fund your transfer." action={<Button icon={Plus} onClick={showSelectType}>Add payment method</Button>} />
                ) : (
                    <div className="space-y-8">
                        {GROUPS.map(({ type, title }) => {
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
                                <Button variant="ghost" icon={ArrowLeft} onClick={backToDelivery}>Back</Button>
                            </div>
                        )}
                    </div>
                )
            ) : view === 'select-type' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    {ADD_OPTIONS.map(({ key, icon: Icon, title, text, tone }) => (
                        <button key={key} type="button" onClick={() => chooseType(key)} className="card group flex flex-col items-start p-6 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20">
                            <div className={cx('mb-4 flex size-12 items-center justify-center rounded-2xl', tone)}><Icon className="size-6" /></div>
                            <p className="text-lg font-semibold text-ink-900">{title}</p>
                            <p className="mt-1 text-sm text-ink-500">{text}</p>
                        </button>
                    ))}
                    <div className="sm:col-span-2">
                        <Button variant="ghost" icon={ArrowLeft} onClick={cancelSelectType}>Cancel</Button>
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
                                    <select value={threeDsMode} disabled={busy} onChange={onThreeDsMode} className="field-control h-8 w-auto py-0 text-xs">
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
                        <Button variant="ghost" icon={ArrowLeft} disabled={busy} onClick={backToSelectType}>Back</Button>
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
                        <Button variant="ghost" icon={ArrowLeft} onClick={backToSelectType}>Back</Button>
                        <span />
                    </CardFooter>
                </Card>
            )}

            <Modal
                open={challengeTab}
                size="md"
                title="3D Secure verification in a new tab"
                description="Complete the challenge from your card issuer in the tab that just opened. In redirect mode the issuer sends that tab to the app's successUrl or failUrl, which reports back here and closes it."
                onClose={closeChallengeTab}
            >
                <div className="space-y-4 px-6 py-5">
                    <p className="text-sm text-ink-600">
                        Waiting for the challenge{pendingPaymentId ? <> (gateway payment <code>{pendingPaymentId}</code>)</> : null}. This page also re-reads the card from Inyo every 5 seconds, so it closes as soon as Inyo reports the result, whatever happens in the other tab.
                    </p>
                    {notice && <Alert tone="warning" title="Notice">{notice}</Alert>}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={confirmCard}>I completed the challenge, check status</Button>
                        <Button size="sm" variant="ghost" onClick={focusChallengeTab}>Go to the challenge tab</Button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={!!challengeUrl}
                size="lg"
                title="3D Secure verification"
                description="Complete the challenge from your card issuer. The result is confirmed with Inyo before the card is enabled."
                onClose={closeChallengeIframe}
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
}
