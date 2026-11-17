import View from './view';
import { useBeneficiaries, type BeneficiariesProps } from './model';

export type { BeneficiariesProps } from './model';

export default function Beneficiaries(ownProps: BeneficiariesProps) {
    const props = useBeneficiaries(ownProps);
    return <View {...props} />;
}
