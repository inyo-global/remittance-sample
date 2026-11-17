import View from './view';
import { useReviewTransaction } from './model';

export default function ReviewTransaction() {
    const props = useReviewTransaction();
    return <View {...props} />;
}
