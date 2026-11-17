import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { request } from '../../api';
import { TransactionContext } from '../../context/transaction';
import { inTransferFlow } from '../../lib/steps';
import { errorMessage } from '../../lib/format';
import type { Beneficiary, User } from '../../types';

export interface BeneficiariesProps {
    user?: User | null;
}

interface RouteState {
    countryCode?: string;
}

export const displayName = (ben: Beneficiary): string => ben.nickname || [ben.data?.firstName, ben.data?.lastName].filter(Boolean).join(' ') || 'Beneficiary';
export const countryOf = (ben: Beneficiary): string | undefined => ben.data?.address?.countryCode || ben.data?.documents?.[0]?.countryCode || ben.data?.countryCode;

export function useBeneficiaries({ user }: BeneficiariesProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const routeState = (location.state || null) as RouteState | null;
    const { transactionData, setTransactionData } = useContext(TransactionContext)!;
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const inFlow = inTransferFlow(transactionData);
    const targetCountry = (routeState?.countryCode || transactionData.countryCode || '').toUpperCase();

    useEffect(() => {
        let cancelled = false;
        request<Beneficiary[]>('get', '/beneficiaries')
            .then((data) => !cancelled && setBeneficiaries(data))
            .catch((err) => !cancelled && setError(errorMessage(err)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [user?.userId]);

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
