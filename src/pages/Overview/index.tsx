import View from './view';
import { useOverview } from './model';

export default function Overview() {
    const props = useOverview();
    return <View {...props} />;
}
