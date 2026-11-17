import View from './view';
import { useKycPanel, type KycPanelProps } from './model';

export type { KycPanelProps } from './model';

export default function KycPanel(ownProps: KycPanelProps) {
    const props = useKycPanel(ownProps);
    return <View {...props} />;
}
