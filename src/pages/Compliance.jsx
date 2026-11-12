import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, ExternalLink, FileText, RefreshCw, ScanFace, ShieldCheck, ThumbsDown, ThumbsUp, Upload } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { useToast } from '../lib/toast';
import { request } from '../api';
import { dateTime, errorMessage, humanize, money } from '../lib/format';
import { cx } from '../lib/cx';

const WINDOWS = [
    { key: 'oneDayLimit', label: '24 hours' },
    { key: 'thirtyDaysLimit', label: '30 days' },
    { key: 'oneHundredAndEightyDaysLimit', label: '180 days' },
];

const levelLabel = (level) => String(level || '').replace('LEVEL_', 'Level ');

const num = (v) => Number(v?.amount ?? v ?? 0);

function UsageBar({ limit, used }) {
    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    const tone = pct >= 90 ? 'bg-danger-500' : pct >= 70 ? 'bg-warning-500' : 'bg-brand-500';
    return (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
        </div>
    );
}

// Session states (docs: "KYC Verification Sessions"): PENDING -> VERIFIED | REJECTED | PENDING_REVIEW
// | SUPERSEDED | FAILED | ERRORED | EXPIRED. In sandbox every verdict lands in PENDING_REVIEW.
const KYC_TONE = { VERIFIED: 'success', REJECTED: 'danger', PENDING_REVIEW: 'warning', PENDING: 'info' };
const kycTone = (status) => KYC_TONE[String(status || '').toUpperCase()] || 'neutral';
const kycTerminal = (status) => ['VERIFIED', 'REJECTED', 'SUPERSEDED', 'FAILED', 'ERRORED', 'EXPIRED', 'ORPHANED'].includes(String(status || '').toUpperCase());

/**
 * Identity verification through the hosted Inyo360 widget.
 * POST /v2/senders/{id}/kycSession -> widgetUrl (opened in a new tab: the widget needs the camera and
 * has no iframe API) -> GET the session until it settles -> in sandbox, /resolve plays the reviewer.
 */
function KycPanel({ onVerified }) {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null); // 'create' | 'check' | 'verified' | 'rejected'
    const [error, setError] = useState(null);

    const status = String(session?.status || session?.data?.status || '').toUpperCase();
    const widgetUrl = session?.widgetUrl || session?.data?.widgetUrl;

    const check = useCallback(async (silent = false) => {
        setBusy('check');
        setError(null);
        try {
            const next = await request('get', '/kyc/session');
            setSession(next);
            const st = String(next?.status || '').toUpperCase();
            if (!silent) toast.info(`Session ${st || 'unknown'}`, st === 'PENDING_REVIEW' ? 'Held for review. In sandbox nobody reviews it: resolve it below.' : undefined);
            if (st === 'VERIFIED') onVerified?.();
            return next;
        } catch (err) {
            setError(errorMessage(err, 'Could not read the session'));
            return null;
        } finally {
            setBusy(null);
            setLoading(false);
        }
    }, [toast, onVerified]);

    useEffect(() => {
        // Returning from the widget (?kyc=done): the redirect says the user finished, not the verdict.
        const fromWidget = params.get('kyc') === 'done';
        request('get', `/kyc/session${fromWidget ? '' : '?refresh=false'}`)
            .then((s) => {
                setSession(s);
                if (fromWidget) {
                    const st = String(s?.status || '').toUpperCase();
                    toast.info('Back from the widget', st ? `Session is ${st}.` : 'No session found.');
                    if (st === 'VERIFIED') onVerified?.();
                    setParams({}, { replace: true });
                }
            })
            .catch((err) => setError(errorMessage(err, 'Could not read the session')))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const create = async () => {
        setBusy('create');
        setError(null);
        try {
            const created = await request('post', '/kyc/session', { language: navigator.language?.split('-')[0] || 'en' });
            setSession(created);
            const url = created.widgetUrl || created.data?.widgetUrl;
            if (url) window.open(url, '_blank', 'noopener');
            toast.success('Verification session created', url ? 'The widget opened in a new tab. Come back here and check the status when you finish.' : 'Inyo returned no widget URL: the session may have been decided at creation (simulated document number).');
            if (String(created.status || '').toUpperCase() !== 'PENDING') check(true);
        } catch (err) {
            setError(errorMessage(err, 'Could not create the session'));
        } finally {
            setBusy(null);
        }
    };

    const resolve = async (outcome) => {
        const reason = window.prompt(`Reason recorded with the ${outcome} resolution (sandbox only):`, outcome === 'verified' ? 'Cleared for the integration walkthrough' : 'Rejected during the integration walkthrough');
        if (reason === null) return;
        setBusy(outcome);
        setError(null);
        try {
            const next = await request('post', `/kyc/session/${session.sessionId}/resolve`, { outcome, reason });
            setSession(next);
            toast.success(`Session resolved as ${outcome}`, 'Same code path as an Inyo reviewer: the document verdict and the compliance level are the real ones.');
            if (outcome === 'verified') onVerified?.();
        } catch (err) {
            setError(errorMessage(err, 'Could not resolve the session'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Card className="mt-6">
            <CardHeader
                title={<span className="flex items-center gap-2"><ScanFace className="size-5 text-brand-600" /> Identity verification</span>}
                description="Hosted Inyo360 widget: document capture + selfie. The document to verify is picked from your declared documents."
                action={session && <Badge tone={kycTone(status)} dot>{status || 'Unknown'}</Badge>}
            />
            <CardBody>
                {error && <Alert tone="danger" className="mb-4" title="KYC session">{error}</Alert>}

                {loading ? (
                    <Spinner label="Loading verification session…" />
                ) : !session ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="max-w-xl text-sm text-ink-600">Start a session to verify your identity document. The widget opens in a new tab and needs the camera. Requires a non-expired passport or driver&apos;s license on your profile.</p>
                        <Button icon={ScanFace} loading={busy === 'create'} onClick={create}>Verify identity</Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                            <div><dt className="text-ink-500">Session</dt><dd className="font-mono text-xs text-ink-800">{session.sessionId}</dd></div>
                            <div><dt className="text-ink-500">Created</dt><dd className="text-ink-800">{dateTime(session.createdAt)}</dd></div>
                            {session.data?.completedAt && <div><dt className="text-ink-500">Completed</dt><dd className="text-ink-800">{dateTime(session.data.completedAt)}</dd></div>}
                            {session.data?.result?.decision && <div><dt className="text-ink-500">Decision</dt><dd className="text-ink-800">{session.data.result.decision}</dd></div>}
                        </dl>

                        {status === 'PENDING_REVIEW' && (
                            <Alert tone="warning" title="Held for review">
                                In sandbox every session with a verdict lands here and nobody reviews it. Resolve it yourself to exercise the review path; the compliance level moves for real.
                            </Alert>
                        )}
                        {status === 'VERIFIED' && <Alert tone="success" title="Document verified">The verdict is on your sender record (kycVerdict) and counts towards the next compliance level.</Alert>}
                        {status === 'PENDING' && !widgetUrl && <Alert tone="info">The widget link is only returned while the session is undecided; create a new session if you closed it.</Alert>}

                        {session.data?.result?.checks?.length > 0 && (
                            <ul className="flex flex-wrap gap-1.5">
                                {session.data.result.checks.map((c) => (
                                    <li key={c.name || c.check}><Badge tone={c.passed === false || c.result === 'failed' ? 'danger' : 'success'}>{humanize(c.name || c.check || 'check')}</Badge></li>
                                ))}
                            </ul>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {widgetUrl && !kycTerminal(status) && (
                                <Button as="a" href={widgetUrl} target="_blank" rel="noopener" variant="dark" icon={ExternalLink}>Open widget</Button>
                            )}
                            <Button variant="secondary" icon={RefreshCw} loading={busy === 'check'} onClick={() => check()}>Check status</Button>
                            {status === 'PENDING_REVIEW' && (
                                <>
                                    <Button variant="success" icon={ThumbsUp} loading={busy === 'verified'} onClick={() => resolve('verified')}>Resolve: verified</Button>
                                    <Button variant="danger" icon={ThumbsDown} loading={busy === 'rejected'} onClick={() => resolve('rejected')}>Resolve: rejected</Button>
                                </>
                            )}
                            {kycTerminal(status) && (
                                <Button variant="secondary" icon={ScanFace} loading={busy === 'create'} onClick={create}>New session</Button>
                            )}
                        </div>
                    </div>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
                    Sandbox: a reserved document number decides the session at creation, with no camera: passport (US) 999003001 approves, 999003007 is a sanctions hit; driver&apos;s license (US, PA) 99900101 approves. Set it on your profile first.{' '}
                    <a href="https://dev.inyoglobal.com/api-references/remittances/sender/uploading-documents/" target="_blank" rel="noreferrer" className="underline">KYC sessions docs</a>
                </p>
            </CardBody>
        </Card>
    );
}

const DOC_TONE = { VERIFIED: 'success', REJECTED: 'danger', PENDING: 'warning' };
const docStatus = (d) => String(d?.verificationStatus || d?.status || '').toUpperCase();
const ACCEPT = 'application/pdf,image/jpeg,image/png';

/**
 * Proof of source of funds (LEVEL_3). File upload -> PENDING -> verified by OCR/compliance in
 * production; in sandbox nothing happens, so /resolve settles it. Uploads only: identity documents
 * verified through the KYC session are not listed here.
 */
function SourceOfFundsPanel({ onVerified }) {
    const toast = useToast();
    const fileRef = useRef(null);
    const [docs, setDocs] = useState(null);
    const [busy, setBusy] = useState(null); // 'upload' | 'list' | `${id}:verified` | `${id}:rejected` | `${id}:status`
    const [error, setError] = useState(null);
    const [reasons, setReasons] = useState({}); // documentId -> last status entry

    const load = useCallback(async (silent = true) => {
        setBusy('list');
        try {
            const list = await request('get', '/documents');
            setDocs(list);
            if (!silent) toast.info(`${list.length} upload${list.length === 1 ? '' : 's'} on file`);
        } catch (err) {
            setError(errorMessage(err, 'Could not list the uploads'));
            setDocs([]);
        } finally {
            setBusy(null);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const upload = async (file) => {
        if (!file) return;
        setError(null);
        if (!ACCEPT.split(',').includes(file.type)) { setError(`"${file.name}" is ${file.type || 'of unknown type'}. The docs accept pdf, jpg, jpeg or png.`); return; }
        if (file.size > 10 * 1024 * 1024) { setError('The docs cap uploads at 10 MB.'); return; }
        setBusy('upload');
        try {
            const res = await request('post', '/documents/source-of-funds', file, {
                headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
            });
            toast.success('Uploaded as PROOF_OF_FUNDS', `Status ${docStatus(res) || 'PENDING'}. In sandbox resolve it below; in production OCR or the compliance team verifies it.`);
            await load();
        } catch (err) {
            setError(errorMessage(err, 'Upload failed'));
        } finally {
            setBusy(null);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const resolve = async (doc, outcome) => {
        const reason = window.prompt(`Reason recorded with the ${outcome} decision (sandbox only):`, outcome === 'verified' ? 'Cleared for the integration walkthrough' : 'Rejected during the integration walkthrough');
        if (reason === null) return;
        setBusy(`${doc.id}:${outcome}`);
        setError(null);
        try {
            const res = await request('post', `/documents/${doc.id}/resolve`, { outcome, reason });
            setReasons((r) => ({ ...r, [doc.id]: res }));
            toast.success(`Document ${outcome}`, `verifiedBy ${res.verifiedBy || 'sandbox'}. Same path as a reviewer's decision.`);
            await load();
            if (outcome === 'verified') onVerified?.();
        } catch (err) {
            setError(errorMessage(err, 'Could not resolve the document'));
        } finally {
            setBusy(null);
        }
    };

    const history = async (doc) => {
        setBusy(`${doc.id}:status`);
        try {
            const entries = await request('get', `/documents/${doc.id}/status`);
            const last = Array.isArray(entries) ? entries[0] : entries;
            setReasons((r) => ({ ...r, [doc.id]: last }));
            toast.info(`Status ${String(last?.status || '').toUpperCase() || 'unknown'}`, last?.reason || undefined);
        } catch (err) {
            toast.error('Could not read the status history', errorMessage(err));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Card className="mt-6">
            <CardHeader
                title={<span className="flex items-center gap-2"><FileText className="size-5 text-brand-600" /> Proof of source of funds</span>}
                description="Level 3 requirement: a bank statement or pay stub, uploaded as PROOF_OF_FUNDS and verified before it counts."
                action={
                    <button type="button" onClick={() => load(false)} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600" title="Reload uploads" aria-label="Reload uploads">
                        <RefreshCw className={`size-4 ${busy === 'list' ? 'animate-spin' : ''}`} />
                    </button>
                }
            />
            <CardBody>
                {error && <Alert tone="danger" className="mb-4" title="Source of funds">{error}</Alert>}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-ink-300 bg-ink-50/60 p-4">
                    <p className="max-w-xl text-sm text-ink-600">PDF, JPG or PNG up to 10 MB. Sandbox analyses nothing, so any file works; the upload lands as PENDING until you resolve it.</p>
                    <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                    <Button icon={Upload} loading={busy === 'upload'} onClick={() => fileRef.current?.click()}>Upload document</Button>
                </div>

                {docs === null ? (
                    <div className="mt-4"><Spinner label="Loading uploads…" /></div>
                ) : docs.length === 0 ? (
                    <p className="mt-4 text-sm text-ink-500">No uploads yet.</p>
                ) : (
                    <ul className="mt-4 divide-y divide-ink-100">
                        {docs.map((d) => {
                            const st = docStatus(d);
                            const last = reasons[d.id];
                            return (
                                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-ink-900">{d.fileName || d.id}</p>
                                        <p className="text-xs text-ink-500">{d.subtype || d.type || 'PROOF_OF_FUNDS'}{d.createdAt ? ` · ${dateTime(d.createdAt)}` : ''}</p>
                                        {last?.reason && <p className="mt-0.5 text-xs text-ink-600">{String(last.status || '').toUpperCase()}: {last.reason}{last.verifiedBy ? ` · ${last.verifiedBy}` : ''}</p>}
                                    </div>
                                    <Badge tone={DOC_TONE[st] || 'neutral'} dot>{st || 'Unknown'}</Badge>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Button size="sm" variant="secondary" loading={busy === `${d.id}:status`} onClick={() => history(d)}>History</Button>
                                        {st === 'PENDING' && (
                                            <>
                                                <Button size="sm" variant="success" icon={ThumbsUp} loading={busy === `${d.id}:verified`} onClick={() => resolve(d, 'verified')}>Verified</Button>
                                                <Button size="sm" variant="danger" icon={ThumbsDown} loading={busy === `${d.id}:rejected`} onClick={() => resolve(d, 'rejected')}>Rejected</Button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
                    Resolve buttons call the sandbox-only endpoint <code>POST /v2/senders/&#123;id&#125;/documents/&#123;documentId&#125;/resolve</code>; in production the status changes arrive through the DocumentUpdatedEvents webhook.{' '}
                    <a href="https://dev.inyoglobal.com/api-references/remittances/sender/uploading-documents/" target="_blank" rel="noreferrer" className="underline">Uploading documents docs</a>
                </p>
            </CardBody>
        </Card>
    );
}

/**
 * Trust level + rolling limits, from GET /participants/{id}/complianceLevels
 * and GET /fx/participants/{id}/limits.
 */
const Compliance = ({ user }) => {
    const [data, setData] = useState(null);
    const [usage, setUsage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        Promise.all([request('get', '/compliance'), request('get', '/limits').catch(() => null)])
            .then(([c, l]) => { setData(c); setUsage(l); })
            .catch((err) => setError(errorMessage(err, 'Failed to load compliance data')))
            .finally(() => setLoading(false));
    }, []);

    const retry = () => { setLoading(true); setError(null); load(); };

    useEffect(() => { load(); }, [user?.userId, load]);

    if (loading) return <Spinner label="Loading compliance level…" />;

    if (error || !data?.currentComplianceLevel) {
        return (
            <div>
                <PageHeader kicker="Account" title="Compliance level" />
                <Alert tone={error ? 'danger' : 'warning'} title={error ? 'Could not load compliance data' : 'No compliance data yet'} action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={retry}>Retry</Button>}>
                    {error || <>Complete your <Link to="/profile" className="font-semibold underline">sender profile</Link> first so Inyo can assign a level.</>}
                </Alert>
            </div>
        );
    }

    const { currentComplianceLevel: current, nextComplianceLevel: next, missingFieldsForNextComplianceLevel: missing = [] } = data;
    const canTransact = current.level !== 'LEVEL_0';

    return (
        <div>
            <PageHeader kicker="Account" title="Compliance level" description="Your trust level sets rolling sending limits across 24 hours, 30 days and 180 days." />

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader
                        title={
                            <span className="flex items-center gap-2">
                                <ShieldCheck className="size-5 text-brand-600" /> Current status
                            </span>
                        }
                        action={<Badge tone={canTransact ? 'success' : 'danger'} dot>{canTransact ? 'Can transact' : 'Cannot transact'}</Badge>}
                    />
                    <CardBody>
                        <div className="flex items-end gap-3">
                            <p className="text-4xl font-bold tracking-tight text-ink-900">{levelLabel(current.level)}</p>
                            {next && <p className="pb-1 text-sm text-ink-500">next: {levelLabel(next.level)}</p>}
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-3">
                            {WINDOWS.map(({ key, label }) => {
                                const limit = num(current.limits?.[key]);
                                const currency = current.limits?.[key]?.currency || 'USD';
                                const used = usage?.[key] ? num(usage[key].used) : null;
                                return (
                                    <div key={key} className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                                        <p className="kicker">{label}</p>
                                        <p className="mt-1.5 text-xl font-bold tabular-nums text-ink-900">{money(limit, currency, { maximumFractionDigits: 0 })}</p>
                                        {used !== null && (
                                            <>
                                                <p className="mt-0.5 text-xs text-ink-500">{money(used, currency)} used · {money(Math.max(limit - used, 0), currency)} left</p>
                                                <UsageBar limit={limit} used={used} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {current.requiredFields?.length > 0 && (
                            <div className="mt-6">
                                <p className="kicker mb-2">Verified for this level</p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {current.requiredFields.map((f) => (
                                        <li key={f}><Badge tone="success"><CheckCircle2 className="size-3" /> {humanize(f)}</Badge></li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {next ? (
                    <Card className="border-brand-200 bg-gradient-to-b from-brand-50/60 to-white">
                        <CardHeader title={`Upgrade to ${levelLabel(next.level)}`} description="Higher limits after additional verification." />
                        <CardBody>
                            <dl className="divide-y divide-ink-100 text-sm">
                                {WINDOWS.map(({ key, label }) => (
                                    <div key={key} className="flex justify-between py-2">
                                        <dt className="text-ink-500">{label}</dt>
                                        <dd className="font-semibold tabular-nums text-brand-700">{money(num(next.limits?.[key]), next.limits?.[key]?.currency || 'USD', { maximumFractionDigits: 0 })}</dd>
                                    </div>
                                ))}
                            </dl>

                            <div className="mt-5">
                                <p className="kicker mb-2">{missing.length ? 'Still missing' : 'Requirements'}</p>
                                {missing.length ? (
                                    <ul className="space-y-1.5">
                                        {missing.map((f) => (
                                            <li key={f} className="flex items-center gap-2 text-sm text-ink-700">
                                                <span className="size-1.5 rounded-full bg-warning-500" /> {humanize(f)}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <Alert tone="success">All requirements are met. The upgrade is applied after Inyo's compliance review.</Alert>
                                )}
                            </div>

                            {next.perTransactionFields?.length > 0 && (
                                <p className="mt-4 text-xs text-ink-500">Per-transaction fields at this level: {next.perTransactionFields.map(humanize).join(', ')}.</p>
                            )}

                            <Button as={Link} to="/profile" className="mt-5 w-full" variant="dark" iconRight={ArrowUpRight}>Update profile</Button>
                            <p className="mt-3 text-center text-[11px] text-ink-400">Identity documents are verified through the KYC session below.</p>
                        </CardBody>
                    </Card>
                ) : (
                    <Card>
                        <CardBody>
                            <p className="font-semibold text-ink-900">You are at the highest level.</p>
                            <p className="mt-1 text-sm text-ink-500">No further upgrades are available for this tenant.</p>
                        </CardBody>
                    </Card>
                )}
            </div>

            <KycPanel onVerified={load} />
            <SourceOfFundsPanel onVerified={load} />
        </div>
    );
};

export default Compliance;
