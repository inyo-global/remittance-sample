import View from './view';
import { useSignup } from './model';

export default function Signup() {
    const props = useSignup();
    return <View {...props} />;
}
