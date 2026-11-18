import { useNavigate } from 'react-router-dom';
import { request } from '../../api';
import { useLoad, useRouteState, useTransaction, useSession } from '../../hooks';
import { inTransferFlow } from '../../lib/steps';
import type { Beneficiary } from '../../types';

interface RouteState {
    countryCode?: string;
}

export const displayName = (ben: Beneficiary): string => ben.nickname || [ben.data?.firstName, ben.data?.lastName].filter(Boolean).join(' ') || 'Beneficiary';
export const countryOf = (ben: Beneficiary): string | undefined => ben.data?.address?.countryCode || ben.data?.documents?.[0]?.countryCode || ben.data?.countryCode;

export function useBeneficiaries() {
    const { user } = useSession();
    const navigate = useNavigate();
    const routeState = useRouteState<RouteState>();
    const { transactionData, setTransactionData } = useTransaction();
    const { data: beneficiaries, loading, error } = useLoad(() => request<Beneficiary[]>('get', '/beneficiaries'), [], [user?.userId]);

    const inFlow = inTransferFlow(transactionData);
    const targetCountry = (routeState?.countryCode || transactionData.countryCode || '').toUpperCase();

    const onSelect = (ben: Beneficiary) => {
        // Outside the send flow this page manages beneficiaries; it must not seed the next transfer.
        if (inFlow) setTransactionData((prev) => ({ ...prev, beneficiary: ben, account: null }));
        navigate(`/beneficiaries/${ben.id}/account`, { state: { countryCode: countryOf(ben) || targetCountry, beneficiary: ben } });
    };

    const onAdd = () => navigate('/beneficiaries/new', { state: { countryCode: targetCountry || undefined } });

    const list = inFlow && targetCountry ? beneficiaries.filter((b) => !countryOf(b) || countryOf(b) === targetCountry) : beneficiaries;

    return { inFlow, targetCountry, loading, error, list, onSelect, onAdd };
}

export type BeneficiariesViewProps = ReturnType<typeof useBeneficiaries>;
