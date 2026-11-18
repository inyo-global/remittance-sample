import View from './view';
import { useBeneficiaries } from './model';

export default function Beneficiaries() {
    const props = useBeneficiaries();
    return <View {...props} />;
}
