import View from './view';
import { useCompliance } from './model';

export default function Compliance() {
    const props = useCompliance();
    return <View {...props} />;
}
