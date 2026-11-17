import View from './view';
import { useAddBeneficiary } from './model';

export default function AddBeneficiary() {
    const props = useAddBeneficiary();
    return <View {...props} />;
}
