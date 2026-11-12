import React, { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Users } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import { request } from '../api';
import { TransactionContext } from '../context/transaction';
import { inTransferFlow } from '../lib/steps';
import { errorMessage, initials } from '../lib/format';

const displayName = (ben) => ben.nickname || [ben.data?.firstName, ben.data?.lastName].filter(Boolean).join(' ') || 'Beneficiary';
const countryOf = (ben) => ben.data?.address?.countryCode || ben.data?.documents?.[0]?.countryCode || ben.data?.countryCode;

const Beneficiaries = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { transactionData, setTransactionData } = useContext(TransactionContext);
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const inFlow = inTransferFlow(transactionData);
    const targetCountry = (location.state?.countryCode || transactionData.countryCode || '').toUpperCase();

    useEffect(() => {
        let cancelled = false;
        request('get', '/beneficiaries')
            .then((data) => !cancelled && setBeneficiaries(data))
            .catch((err) => !cancelled && setError(errorMessage(err)))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [user?.userId]);

    const handleSelect = (ben) => {
        // Outside the send flow this page manages beneficiaries; it must not seed the next transfer.
        if (inFlow) setTransactionData((prev) => ({ ...prev, beneficiary: ben, account: null }));
        navigate(`/beneficiaries/${ben.id}/account`, { state: { countryCode: countryOf(ben) || targetCountry, beneficiary: ben } });
    };

    const list = inFlow && targetCountry ? beneficiaries.filter((b) => !countryOf(b) || countryOf(b) === targetCountry) : beneficiaries;

    return (
        <div>
            <PageHeader
                kicker={inFlow ? 'Step 2 of 5' : 'Account'}
                title={inFlow ? 'Who are you sending to?' : 'Beneficiaries'}
                description={inFlow && targetCountry ? `Showing beneficiaries in ${targetCountry}. Recipients are created per country schema.` : 'People you can send money to.'}
                actions={<Button icon={Plus} onClick={() => navigate('/beneficiaries/new', { state: { countryCode: targetCountry || undefined } })}>Add beneficiary</Button>}
            />

            {error && <Alert tone="danger" className="mb-6">{error}</Alert>}

            {loading ? (
                <Spinner label="Loading beneficiaries…" />
            ) : list.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title={targetCountry && inFlow ? `No beneficiaries in ${targetCountry} yet` : 'No beneficiaries yet'}
                    description="Add a recipient. The form adapts to the destination country's required fields."
                    action={<Button icon={Plus} onClick={() => navigate('/beneficiaries/new', { state: { countryCode: targetCountry || undefined } })}>Add beneficiary</Button>}
                />
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {list.map((ben) => (
                        <li key={ben.id}>
                            <button
                                type="button"
                                onClick={() => handleSelect(ben)}
                                className="card group flex w-full items-center gap-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
                            >
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                                    {initials(displayName(ben))}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-ink-900">{displayName(ben)}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {countryOf(ben) && <Badge tone="neutral">{countryOf(ben)}</Badge>}
                                        {ben.data?.documents?.[0]?.type && (
                                            <span className="text-xs text-ink-400">
                                                {ben.data.documents[0].type}{ben.data.documents[0].document && !/MASK/i.test(ben.data.documents[0].document) ? ` · ${ben.data.documents[0].document}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="size-5 text-ink-300 transition-colors group-hover:text-brand-600" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default Beneficiaries;
