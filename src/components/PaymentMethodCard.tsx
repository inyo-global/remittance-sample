import type { ReactNode } from 'react';
import { ChevronRight, CreditCard, Landmark } from 'lucide-react';
import Badge from './ui/Badge';
import { fundingStatus } from '../lib/status';
import { cx } from '../lib/cx';
import { isUsable, methodStatus, methodSubtitle, methodTitle } from '../lib/paymentMethods';
import type { PaymentMethod } from '../types';

export interface PaymentMethodCardProps {
    method: PaymentMethod;
    onSelect?: (method: PaymentMethod) => void;
    children?: ReactNode;
}

/** Gateway webhook echo stored next to the funding account (see server.js gatewayWebhook). */
interface GatewayEvent {
    status?: string;
    receivedAt?: string;
    eventDate?: string;
    paymentId?: string;
}

/** One funding account. `onSelect` makes it a button (send flow); otherwise it is a static card. */
export default function PaymentMethodCard({ method, onSelect, children }: PaymentMethodCardProps) {
    const status = fundingStatus(methodStatus(method));
    const usable = isUsable(method);
    const Icon = method.type === 'ACH' ? Landmark : CreditCard;
    const Comp = onSelect ? 'button' : 'div';
    const gatewayEvent = method.data?.gatewayEvent as GatewayEvent | undefined;
    const coreStatus = method.data?.apiResponse?.coreStatus;

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
                    {gatewayEvent && (
                        <Badge tone={gatewayEvent.status === 'AUTHORIZED' ? 'success' : 'danger'} className="font-mono" title={`Gateway webhook received ${gatewayEvent.receivedAt} (event ${gatewayEvent.eventDate || '?'}), paymentId ${gatewayEvent.paymentId || '?'}`}>
                            webhook {gatewayEvent.status}
                        </Badge>
                    )}
                    {coreStatus && (
                        <Badge tone="warning" title="Status currently reported by Inyo (GET /fundingAccounts). Transfers are only accepted once Inyo reports Verified.">
                            Inyo: {fundingStatus(coreStatus).label}
                        </Badge>
                    )}
                </div>
            </div>
            {children}
            {onSelect && usable && <ChevronRight className="size-5 text-ink-300 transition-colors group-hover:text-brand-600" />}
        </Comp>
    );
}
