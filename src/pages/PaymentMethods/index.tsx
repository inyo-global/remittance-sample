import View from './view';
import { usePaymentMethods } from './model';

export default function PaymentMethods() {
    const props = usePaymentMethods();
    return <View {...props} />;
}
