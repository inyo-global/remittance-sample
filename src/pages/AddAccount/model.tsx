import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { schemaDefaults } from '../../lib/schema';
import { request } from '../../api';
import { useRouteState, useTransaction } from '../../hooks';
import { inTransferFlow } from '../../lib/steps';
import { errorMessage, maskAccount } from '../../lib/format';
import type { Bank, BanksResponse, Beneficiary, BeneficiaryAccount, BeneficiaryAccountCreateResponse, BeneficiaryAccountData, JsonSchema, PayoutMethod } from '../../types';

interface RouteState {
    countryCode?: string;
    beneficiary?: Beneficiary;
}

export const accountTitle = (acc: BeneficiaryAccount, banks: Bank[]): string => {
    const pm: PayoutMethod = acc.data?.payoutMethod || {};
    const bank = banks.find((b) => b.code === pm.bankCode)?.name;
    if (pm.type === 'PIX') return `PIX · ${pm.keyType || ''}`;
    if (pm.type === 'WALLET') return pm.walletOperator || 'Wallet';
    return bank || pm.bankCode || 'Bank account';
};

export const accountSubtitle = (acc: BeneficiaryAccount): string | undefined => {
    const pm: PayoutMethod = acc.data?.payoutMethod || {};
    if (pm.type === 'PIX') return pm.key;
    const number = pm.accountNumber || pm.clabe || pm.walletId;
    return [pm.accountType, maskAccount(number)].filter(Boolean).join(' · ');
};

/**
 * Beneficiary payout account (recipient account). The form is generated from
 * GET /payout/recipientAccounts/schema/{countryCode}; bank codes come from
 * GET /payout/{countryCode}/banks.
 */
export function useAddAccount() {
    const { id } = useParams<{ id: string }>();
    const routeState = useRouteState<RouteState>();
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useTransaction();

    const beneficiary = routeState?.beneficiary || transactionData.beneficiary;
    const countryCode = (routeState?.countryCode || beneficiary?.data?.address?.countryCode || beneficiary?.data?.documents?.[0]?.countryCode || transactionData.countryCode || '').toUpperCase();

    const [schema, setSchema] = useState<JsonSchema | null>(null);
    const [formData, setFormData] = useState<BeneficiaryAccountData>({});
    const [banks, setBanks] = useState<Bank[]>([]);
    const [accounts, setAccounts] = useState<BeneficiaryAccount[]>([]);
    const [view, setView] = useState<'list' | 'add'>('list');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const accountsRes = await request<BeneficiaryAccount[]>('get', `/beneficiaries/${id}/accounts`);
                if (cancelled) return;
                setAccounts(accountsRes);
                setView(accountsRes.length > 0 ? 'list' : 'add');

                if (!countryCode) throw new Error('Destination country is unknown for this beneficiary.');
                const [schemaRes, banksRes] = await Promise.all([
                    request<JsonSchema>('get', `/beneficiaries/account-schema/${countryCode}`),
                    request<BanksResponse>('get', `/banks/${countryCode}`).catch((): BanksResponse => []),
                ]);
                if (cancelled) return;
                setSchema(schemaRes);
                setFormData(schemaDefaults(schemaRes) as BeneficiaryAccountData);
                // Docs show a plain array; some tenants return {items:[...]}.
                setBanks(Array.isArray(banksRes) ? banksRes : banksRes?.items || []);
            } catch (err) {
                if (!cancelled) setError(errorMessage(err, 'Could not load delivery options'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [id, countryCode]);

    const inFlow = inTransferFlow(transactionData);
    const selectAccount = (account: BeneficiaryAccount) => {
        if (!inFlow) {
            // Managing accounts from the sidebar: nothing to select, go back to the list.
            navigate('/beneficiaries');
            return;
        }
        setTransactionData((prev) => ({ ...prev, account }));
        navigate('/payment');
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await request<BeneficiaryAccountCreateResponse>('post', '/beneficiaries/account', {
                beneficiaryId: id,
                externalPersonId: beneficiary?.externalId,
                formData,
            });
            selectAccount({ id: res.id, externalId: res.externalAccountId, data: formData });
        } catch (err) {
            setError(errorMessage(err, 'Failed to add the bank account'));
        } finally {
            setSaving(false);
        }
    };

    const optionsFor = (key: string) => (key === 'bankCode' && banks.length ? banks.map((b) => ({ value: b.code ?? '', label: b.name ?? '' })) : null);

    const name = beneficiary?.nickname || [beneficiary?.data?.firstName, beneficiary?.data?.lastName].filter(Boolean).join(' ') || 'the beneficiary';

    const showAdd = () => setView('add');
    const goBack = () => (accounts.length ? setView('list') : navigate(-1));

    return { countryCode, schema, formData, setFormData, banks, accounts, view, loading, saving, error, inFlow, name, selectAccount, handleSubmit, optionsFor, showAdd, goBack };
}

export type AddAccountViewProps = ReturnType<typeof useAddAccount>;
