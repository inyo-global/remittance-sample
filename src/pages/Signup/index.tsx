import View from './view';
import { useSignup, type SignupProps } from './model';

export type { SignupProps } from './model';

export default function Signup(ownProps: SignupProps) {
    const props = useSignup(ownProps);
    return <View {...props} />;
}
