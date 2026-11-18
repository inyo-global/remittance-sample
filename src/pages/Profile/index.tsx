import View from './view';
import { useProfile } from './model';

export default function Profile() {
    const props = useProfile();
    return <View {...props} />;
}
