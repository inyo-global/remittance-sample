import View from './view';
import { useDashboard, type DashboardProps } from './model';

export type { DashboardProps } from './model';

export default function Dashboard(ownProps: DashboardProps) {
    const props = useDashboard(ownProps);
    return <View {...props} />;
}
