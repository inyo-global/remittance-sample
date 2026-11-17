import View from './view';
import { useStepNavigation, type StepNavigationProps } from './model';

export type { StepNavigationProps } from './model';

export default function StepNavigation(ownProps: StepNavigationProps) {
    const props = useStepNavigation(ownProps);
    return <View {...props} />;
}
