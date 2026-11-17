import View from './view';
import { usePaymentMethodCard, type PaymentMethodCardProps } from './model';

export type { PaymentMethodCardProps } from './model';

export default function PaymentMethodCard(ownProps: PaymentMethodCardProps) {
    const props = usePaymentMethodCard(ownProps);
    return <View {...props} />;
}
