import React, { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../components/ui/Card';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import SchemaForm from '../components/SchemaForm';
import { schemaDefaults } from '../lib/schema';
import { request } from '../api';
import { TransactionContext } from '../context/transaction';
import { inTransferFlow } from '../lib/steps';
import { errorMessage } from '../lib/format';

/**
 * Creates a recipient Person. The form is generated from
 * GET /payout/recipients/schema/{countryCode}, as the docs require.
 */
const AddBeneficiary = () => {
    const { state } = useLocation();
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useContext(TransactionContext);

    const [countryCode, setCountryCode] = useState((state?.countryCode || transactionData.countryCode || '').toUpperCase());
    const [destinations, setDestinations] = useState([]);
    const [schema, setSchema] = useState(null);
    const [formData, setFormData] = useState({});
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        request('get', '/destinations')
            .then((data) => setDestinations(data.countryDestinations || (Array.isArray(data) ? data : [])))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!countryCode) return undefined;
        let cancelled = false;
        setLoadingSchema(true);
        setError(null);
        request('get', `/beneficiaries/schema/${countryCode}`)
            .then((res) => {
                if (cancelled) return;
                setSchema(res);
                setFormData(schemaDefaults(res));
            })
            .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load the recipient schema')))
            .finally(() => !cancelled && setLoadingSchema(false));
        return () => { cancelled = true; };
    }, [countryCode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await request('post', '/beneficiaries', {
                nickname: [formData.firstName, formData.lastName].filter(Boolean).join(' '),
                countryCode,
                formData,
            });
            const beneficiary = { id: res.id, externalId: res.externalId, nickname: [formData.firstName, formData.lastName].filter(Boolean).join(' '), data: formData };
            if (inTransferFlow(transactionData)) setTransactionData((prev) => ({ ...prev, beneficiary, account: null }));
            navigate(`/beneficiaries/${res.id}/account`, { state: { countryCode, beneficiary } });
        } catch (err) {
            setError(errorMessage(err, 'Failed to add beneficiary'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                kicker={transactionData.quote ? 'Step 2 of 5' : 'Account'}
                title="New beneficiary"
                description="Fields below come straight from the Inyo recipient schema for the selected country."
            />

            <form onSubmit={handleSubmit} noValidate>
                <Card>
                    <CardBody className="space-y-6">
                        <Field
                            label="Destination country"
                            name="countryCode"
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            options={destinations.map((d) => ({ value: d.country, label: `${d.emoji ? `${d.emoji} ` : ''}${d.countryName}` }))}
                            placeholder="Select a country"
                            disabled={!!transactionData.quote}
                            hint={transactionData.quote ? 'Locked to the country of your quote.' : undefined}
                            required
                            className="max-w-sm"
                        />

                        {loadingSchema ? (
                            <Spinner label="Loading country requirements…" />
                        ) : schema ? (
                            <SchemaForm schema={schema} value={formData} onChange={setFormData} />
                        ) : !countryCode ? (
                            <p className="text-sm text-ink-500">Choose a country to load its recipient requirements.</p>
                        ) : null}

                        {error && <Alert tone="danger" title="Could not create the beneficiary">{error}</Alert>}
                    </CardBody>
                    <CardFooter>
                        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
                        <Button type="submit" loading={saving} disabled={!schema} iconRight={ArrowRight}>Save and add bank account</Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
};

export default AddBeneficiary;
