import React from 'react';
import { ChevronRight, CreditCard, Landmark } from 'lucide-react';
import Badge from './ui/Badge';
import { fundingStatus } from '../lib/status';
import { cx } from '../lib/cx';
import { isUsable, methodStatus, methodSubtitle, methodTitle } from '../lib/paymentMethods';

/** One funding account. `onSelect` makes it a button (send flow); otherwise it is a static card. */
export default function PaymentMethodCard({ method, onSelect, children }) {
    const status = fundingStatus(methodStatus(method));
    const usable = isUsable(method);
    const Icon = method.type === 'ACH' ? Landmark : CreditCard;
    const Comp = onSelect ? 'button' : 'div';

    return (
        <Comp
            type={onSelect ? 'button' : undefined}
            onClick={onSelect ? () => onSelect(method) : undefined}
            disabled={onSelect ? !usable : undefined}
            className={cx(
                'card flex w-full items-center gap-4 p-4 text-left',
                onSelect && usable && 'group transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20',
                onSelect && !usable && 'cursor-not-allowed opacity-60',
            )}
        >
            <div className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl', method.type === 'ACH' ? 'bg-info-50 text-info-600' : 'bg-brand-50 text-brand-600')}>
                <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">{methodTitle(method)}</p>
                <p className="mt-0.5 text-sm text-ink-500">{methodSubtitle(method)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={status.tone} dot>{status.label}</Badge>
                    {method.type === 'ACH' && <Badge>Plaid</Badge>}
                    {method.data?.gatewayEvent && (
                        <Badge tone={method.data.gatewayEvent.status === 'AUTHORIZED' ? 'success' : 'danger'} className="font-mono" title={`Gateway webhook received ${method.data.gatewayEvent.receivedAt} (event ${method.data.gatewayEvent.eventDate || '?'}), paymentId ${method.data.gatewayEvent.paymentId || '?'}`}>
                            webhook {method.data.gatewayEvent.status}
                        </Badge>
                    )}
                    {method.data?.apiResponse?.coreStatus && (
                        <Badge tone="warning" title="Status currently reported by Inyo (GET /fundingAccounts). Transfers are only accepted once Inyo reports Verified.">
                            Inyo: {fundingStatus(method.data.apiResponse.coreStatus).label}
                        </Badge>
                    )}
                </div>
            </div>
            {children}
            {onSelect && usable && <ChevronRight className="size-5 text-ink-300 transition-colors group-hover:text-brand-600" />}
        </Comp>
    );
}
