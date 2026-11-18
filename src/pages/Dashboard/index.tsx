import View from './view';
import { useDashboard } from './model';

export default function Dashboard() {
    const props = useDashboard();
    return <View {...props} />;
}
