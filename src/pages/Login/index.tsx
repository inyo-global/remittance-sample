import View from './view';
import { useLogin, type LoginProps } from './model';

export type { LoginProps } from './model';

export default function Login(ownProps: LoginProps) {
    const props = useLogin(ownProps);
    return <View {...props} />;
}
