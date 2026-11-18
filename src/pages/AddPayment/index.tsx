import View from './view';
import { useAddPayment } from './model';

export default function AddPayment() {
    const props = useAddPayment();
    return <View {...props} />;
}
