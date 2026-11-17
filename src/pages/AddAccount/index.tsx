import View from './view';
import { useAddAccount } from './model';

export default function AddAccount() {
    const props = useAddAccount();
    return <View {...props} />;
}
