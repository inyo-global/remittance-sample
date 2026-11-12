import React, { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, Landmark, Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import SchemaForm from '../components/SchemaForm';
import { schemaDefaults } from '../lib/schema';
import { request } from '../api';
import { TransactionContext } from '../context/transaction';
import { inTransferFlow } from '../lib/steps';
import { cx } from '../lib/cx';
import { errorMessage, maskAccount } from '../lib/format';

const accountTitle = (acc, banks) => {
    const pm = acc.data?.payoutMethod || {};
    const bank = banks.find((b) => b.code === pm.bankCode)?.name;
    if (pm.type === 'PIX') return `PIX · ${pm.keyType || ''}`;
    if (pm.type === 'WALLET') return pm.walletOperator || 'Wallet';
    return bank || pm.bankCode || 'Bank account';
};

const accountSubtitle = (acc) => {
    const pm = acc.data?.payoutMethod || {};
    if (pm.type === 'PIX') return pm.key;
    const number = pm.accountNumber || pm.clabe || pm.walletId;
    return [pm.accountType, maskAccount(number)].filter(Boolean).join(' · ');
};

/**
 * Beneficiary payout account (recipient account). The form is generated from
 * GET /payout/recipientAccounts/schema/{countryCode}; bank codes come from
 * GET /payout/{countryCode}/banks.
 */
const AddAccount = () => {
    const { id } = useParams();
    const { state } = useLocation();
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useContext(TransactionContext);

    const beneficiary = state?.beneficiary || transactionData.beneficiary;
    const countryCode = (state?.countryCode || beneficiary?.data?.address?.countryCode || beneficiary?.data?.documents?.[0]?.countryCode || transactionData.countryCode || '').toUpperCase();

    const [schema, setSchema] = useState(null);
    const [formData, setFormData] = useState({});
    const [banks, setBanks] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [view, setView] = useState('list');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const accountsRes = await request('get', `/beneficiaries/${id}/accounts`);
                if (cancelled) return;
                setAccounts(accountsRes);
                setView(accountsRes.length > 0 ? 'list' : 'add');

                if (!countryCode) throw new Error('Destination country is unknown for this beneficiary.');
                const [schemaRes, banksRes] = await Promise.all([
                    request('get', `/beneficiaries/account-schema/${countryCode}`),
                    request('get', `/banks/${countryCode}`).catch(() => []),
                ]);
                if (cancelled) return;
                setSchema(schemaRes);
                setFormData(schemaDefaults(schemaRes));
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
    const selectAccount = (account) => {
        if (!inFlow) {
            // Managing accounts from the sidebar: nothing to select, go back to the list.
            navigate('/beneficiaries');
            return;
        }
        setTransactionData((prev) => ({ ...prev, account }));
        navigate('/payment');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await request('post', '/beneficiaries/account', {
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

    const optionsFor = (key) => (key === 'bankCode' && banks.length ? banks.map((b) => ({ value: b.code, label: b.name })) : null);

    const name = beneficiary?.nickname || [beneficiary?.data?.firstName, beneficiary?.data?.lastName].filter(Boolean).join(' ') || 'the beneficiary';

    return (
        <div>
            <PageHeader
                kicker={inFlow ? 'Step 3 of 5' : 'Account'}
                title="Delivery options"
                description={inFlow ? `How should ${name} receive the money?` : `Payout accounts registered for ${name}.`}
                actions={view === 'list' && schema ? <Button variant="secondary" icon={Plus} onClick={() => setView('add')}>Add account</Button> : null}
            />

            {error && !loading && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading delivery options…" />
            ) : view === 'list' ? (
                accounts.length === 0 ? (
                    <EmptyState icon={Landmark} title="No payout account yet" description="Add a bank account, PIX key or wallet for this beneficiary." action={<Button icon={Plus} onClick={() => setView('add')}>Add account</Button>} />
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {accounts.map((acc) => (
                            <li key={acc.id}>
                                <button
                                    type="button"
                                    disabled={!inFlow}
                                    onClick={() => selectAccount(acc)}
                                    className={cx('card flex w-full items-center gap-4 p-4 text-left', inFlow && 'group transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20')}
                                >
                                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                                        <Landmark className="size-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-ink-900">{accountTitle(acc, banks)}</p>
                                        <p className="mt-0.5 truncate text-sm text-ink-500">{accountSubtitle(acc)}</p>
                                        <div className="mt-1.5 flex gap-1.5">
                                            <Badge tone="brand">{acc.data?.payoutMethod?.type || 'BANK_DEPOSIT'}</Badge>
                                            {acc.data?.asset && <Badge>{acc.data.asset}</Badge>}
                                        </div>
                                    </div>
                                    {inFlow && <ChevronRight className="size-5 text-ink-300 transition-colors group-hover:text-brand-600" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )
            ) : (
                <form onSubmit={handleSubmit} noValidate>
                    <Card>
                        <CardBody>
                            {schema ? (
                                <SchemaForm schema={schema} value={formData} onChange={setFormData} optionsFor={optionsFor} hiddenKeys={['externalId']} />
                            ) : (
                                <p className="text-sm text-ink-500">The account schema for {countryCode || 'this country'} is unavailable.</p>
                            )}
                        </CardBody>
                        <CardFooter>
                            <Button variant="ghost" icon={ArrowLeft} onClick={() => (accounts.length ? setView('list') : navigate(-1))}>Back</Button>
                            <Button type="submit" loading={saving} disabled={!schema} iconRight={ArrowRight}>{inFlow ? 'Save and continue' : 'Save account'}</Button>
                        </CardFooter>
                    </Card>
                </form>
            )}
        </div>
    );
};

export default AddAccount;
