import View from './view';
import { useSourceOfFundsPanel, type SourceOfFundsPanelProps } from './model';

export type { SourceOfFundsPanelProps } from './model';

export default function SourceOfFundsPanel(ownProps: SourceOfFundsPanelProps) {
    const props = useSourceOfFundsPanel(ownProps);
    return <View {...props} />;
}
