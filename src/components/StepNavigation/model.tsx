import { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TransactionContext } from '../../context/transaction';
import { currentStepIndex } from '../../lib/steps';

/** The stepper reads everything from the route and the transfer context. */
export type StepNavigationProps = Record<string, never>;

export function useStepNavigation(_props: StepNavigationProps) {
    const location = useLocation();
    const navigate = useNavigate();
    // Only rendered inside the send flow, under <TransactionProvider>.
    const { transactionData } = useContext(TransactionContext)!;
    const current = currentStepIndex(location.pathname);

    // A step is reachable when the data it needs already exists in the flow context.
    const reachable = [
        true,
        !!transactionData.quote,
        !!transactionData.beneficiary,
        !!transactionData.account,
        !!transactionData.paymentMethod,
    ];

    const pathFor = (index: number): string => {
        switch (index) {
            case 0: return '/dashboard';
            case 1: return '/beneficiaries';
            case 2: return transactionData.beneficiary ? `/beneficiaries/${transactionData.beneficiary.id}/account` : '/beneficiaries';
            case 3: return '/payment';
            default: return '/transaction/review';
        }
    };

    const onGo = (index: number) => navigate(pathFor(index));

    return { current, reachable, onGo };
}

export type StepNavigationViewProps = ReturnType<typeof useStepNavigation>;
