import View from './view';
import { useLogin } from './model';

export default function Login() {
    const props = useLogin();
    return <View {...props} />;
}
