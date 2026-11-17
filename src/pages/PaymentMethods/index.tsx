import View from './view';
import { usePaymentMethods, type PaymentMethodsProps } from './model';

export type { PaymentMethodsProps } from './model';

export default function PaymentMethods(ownProps: PaymentMethodsProps) {
    const props = usePaymentMethods(ownProps);
    return <View {...props} />;
}
