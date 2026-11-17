import View from './view';
import { useProfile, type ProfileProps } from './model';

export type { ProfileProps } from './model';

export default function Profile(ownProps: ProfileProps) {
    const props = useProfile(ownProps);
    return <View {...props} />;
}
