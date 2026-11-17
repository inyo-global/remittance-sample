import View from './view';
import { useAddPayment, type AddPaymentProps } from './model';

export type { AddPaymentProps } from './model';

export default function AddPayment(ownProps: AddPaymentProps) {
    const props = useAddPayment(ownProps);
    return <View {...props} />;
}
