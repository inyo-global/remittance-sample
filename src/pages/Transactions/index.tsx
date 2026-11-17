import View from './view';
import { useTransactions, type TransactionsProps } from './model';

export type { TransactionsProps } from './model';

export default function Transactions(ownProps: TransactionsProps) {
    const props = useTransactions(ownProps);
    return <View {...props} />;
}
