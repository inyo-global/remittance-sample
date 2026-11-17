import View from './view';
import { useWebhookPanel, type WebhookPanelProps } from './model';

export type { WebhookPanelProps } from './model';

export default function WebhookPanel(ownProps: WebhookPanelProps) {
    const props = useWebhookPanel(ownProps);
    return <View {...props} />;
}
