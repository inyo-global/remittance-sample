import { ExternalLink, RefreshCw, ScanFace, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Alert from '../ui/Alert';
import Spinner from '../ui/Spinner';
import { dateTime, humanize } from '../../lib/format';
import { kycTerminal, kycTone, type KycPanelViewProps } from './model';

export default function KycPanelView({ session, loading, busy, error, status, widgetUrl, check, create, resolve }: KycPanelViewProps) {
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

                        {session.data?.result?.checks && session.data.result.checks.length > 0 && (
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
