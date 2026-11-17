import type { ReactNode } from 'react';
import { CreditCard, Landmark } from 'lucide-react';
import { fundingStatus } from '../../lib/status';
import { isUsable, methodStatus } from '../../lib/paymentMethods';
import type { PaymentMethod } from '../../types';

export interface PaymentMethodCardProps {
    method: PaymentMethod;
    onSelect?: (method: PaymentMethod) => void;
    children?: ReactNode;
}

/** Gateway webhook echo stored next to the funding account (see server/services/fundingAccounts.ts gatewayWebhook). */
export interface GatewayEvent {
    status?: string;
    receivedAt?: string;
    eventDate?: string;
    paymentId?: string;
}

/** One funding account. `onSelect` makes it a button (send flow); otherwise it is a static card. */
export function usePaymentMethodCard({ method, onSelect, children }: PaymentMethodCardProps) {
    const status = fundingStatus(methodStatus(method));
    const usable = isUsable(method);
    const Icon = method.type === 'ACH' ? Landmark : CreditCard;
    const gatewayEvent = method.data?.gatewayEvent as GatewayEvent | undefined;
    const coreStatus = method.data?.apiResponse?.coreStatus;

    return { method, onSelect, children, status, usable, Icon, gatewayEvent, coreStatus };
}

export type PaymentMethodCardViewProps = ReturnType<typeof usePaymentMethodCard>;
