import View from './view';
import { useAuthShell, type AuthShellProps } from './model';

export type { AuthShellProps } from './model';

export default function AuthShell(ownProps: AuthShellProps) {
    const props = useAuthShell(ownProps);
    return <View {...props} />;
}
