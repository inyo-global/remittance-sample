import { RefreshCw, Webhook } from 'lucide-react';
import { Card, CardBody } from '../ui/Card';
import Button from '../ui/Button';
import type { WebhookPanelViewProps } from './model';

export default function WebhookPanelView({ info, loading, url, load }: WebhookPanelViewProps) {
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
