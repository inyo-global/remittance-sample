import { FileText, RefreshCw, ThumbsDown, ThumbsUp, Upload } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Alert from '../ui/Alert';
import Spinner from '../ui/Spinner';
import { dateTime } from '../../lib/format';
import { ACCEPT, DOC_TONE, docStatus, type SourceOfFundsPanelViewProps } from './model';

export default function SourceOfFundsPanelView({ fileRef, docs, busy, error, reasons, load, upload, resolve, history, pickFile }: SourceOfFundsPanelViewProps) {
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
                    <Button icon={Upload} loading={busy === 'upload'} onClick={pickFile}>Upload document</Button>
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
