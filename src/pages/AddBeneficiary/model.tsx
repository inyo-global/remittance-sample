import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { schemaDefaults } from '../../lib/schema';
import { request } from '../../api';
import { useRouteState, useTransaction } from '../../hooks';
import { inTransferFlow } from '../../lib/steps';
import { errorMessage } from '../../lib/format';
import type { Beneficiary, BeneficiaryCreateResponse, BeneficiaryData, Destination, DestinationsResponse, JsonSchema } from '../../types';

interface RouteState {
    countryCode?: string;
}

const fullName = (data: BeneficiaryData): string => [data.firstName, data.lastName].filter(Boolean).join(' ');

/**
 * Creates a recipient Person. The form is generated from
 * GET /payout/recipients/schema/{countryCode}, as the docs require.
 */
export function useAddBeneficiary() {
    const routeState = useRouteState<RouteState>();
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useTransaction();

    const [countryCode, setCountryCode] = useState((routeState?.countryCode || transactionData.countryCode || '').toUpperCase());
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [schema, setSchema] = useState<JsonSchema | null>(null);
    const [formData, setFormData] = useState<BeneficiaryData>({});
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        request<DestinationsResponse>('get', '/destinations')
            .then((data) => setDestinations(Array.isArray(data) ? data : data.countryDestinations || []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!countryCode) return undefined;
        let cancelled = false;
        setLoadingSchema(true);
        setError(null);
        request<JsonSchema>('get', `/beneficiaries/schema/${countryCode}`)
            .then((res) => {
                if (cancelled) return;
                setSchema(res);
                setFormData(schemaDefaults(res) as BeneficiaryData);
            })
            .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load the recipient schema')))
            .finally(() => !cancelled && setLoadingSchema(false));
        return () => { cancelled = true; };
    }, [countryCode]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await request<BeneficiaryCreateResponse>('post', '/beneficiaries', {
                nickname: fullName(formData),
                countryCode,
                formData,
            });
            const beneficiary: Beneficiary = { id: res.id, externalId: res.externalId, nickname: fullName(formData), data: formData };
            if (inTransferFlow(transactionData)) setTransactionData((prev) => ({ ...prev, beneficiary, account: null }));
            navigate(`/beneficiaries/${res.id}/account`, { state: { countryCode, beneficiary } });
        } catch (err) {
            setError(errorMessage(err, 'Failed to add beneficiary'));
        } finally {
            setSaving(false);
        }
    };

    const goBack = () => navigate(-1);
    const quoteLocked = !!transactionData.quote;

    return { countryCode, setCountryCode, destinations, schema, formData, setFormData, loadingSchema, saving, error, quoteLocked, handleSubmit, goBack };
}

export type AddBeneficiaryViewProps = ReturnType<typeof useAddBeneficiary>;
