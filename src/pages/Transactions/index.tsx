import View from './view';
import { useTransactions } from './model';

export default function Transactions() {
    const props = useTransactions();
    return <View {...props} />;
}
