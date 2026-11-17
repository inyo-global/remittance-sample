import View from './view';
import { useOverview, type OverviewProps } from './model';

export type { OverviewProps } from './model';

export default function Overview(ownProps: OverviewProps) {
    const props = useOverview(ownProps);
    return <View {...props} />;
}
