import View from './view';
import { useReceipt } from './model';

export default function Receipt() {
    const props = useReceipt();
    return <View {...props} />;
}
