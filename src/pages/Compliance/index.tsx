import View from './view';
import { useCompliance, type ComplianceProps } from './model';

export type { ComplianceProps } from './model';

export default function Compliance(ownProps: ComplianceProps) {
    const props = useCompliance(ownProps);
    return <View {...props} />;
}
