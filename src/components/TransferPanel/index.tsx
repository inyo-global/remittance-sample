import View from './view';
import { useTransferPanel, type TransferPanelProps } from './model';

export type { TransferPanelProps } from './model';

export default function TransferPanel(ownProps: TransferPanelProps) {
    const props = useTransferPanel(ownProps);
    return <View {...props} />;
}
