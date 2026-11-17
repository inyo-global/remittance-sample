import View from './view';
import { useMainLayout, type MainLayoutProps } from './model';

export type { MainLayoutProps } from './model';

export default function MainLayout(ownProps: MainLayoutProps) {
    const props = useMainLayout(ownProps);
    return <View {...props} />;
}
