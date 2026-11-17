import { ArrowLeft, ArrowRight } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import SchemaForm from '../../components/SchemaForm';
import type { AddBeneficiaryViewProps } from './model';

export default function AddBeneficiaryView({ countryCode, setCountryCode, destinations, schema, formData, setFormData, loadingSchema, saving, error, quoteLocked, handleSubmit, goBack }: AddBeneficiaryViewProps) {
    return (
        <div>
            <PageHeader
                kicker={quoteLocked ? 'Step 2 of 5' : 'Account'}
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
                            options={destinations.map((d) => ({ value: d.country ?? '', label: `${d.emoji ? `${d.emoji} ` : ''}${d.countryName}` }))}
                            placeholder="Select a country"
                            disabled={quoteLocked}
                            hint={quoteLocked ? 'Locked to the country of your quote.' : undefined}
                            required
                            className="max-w-sm"
                        />

                        {loadingSchema ? (
                            <Spinner label="Loading country requirements…" />
                        ) : schema ? (
                            <SchemaForm schema={schema} value={formData} onChange={setFormData as (next: Record<string, unknown>) => void} />
                        ) : !countryCode ? (
                            <p className="text-sm text-ink-500">Choose a country to load its recipient requirements.</p>
                        ) : null}

                        {error && <Alert tone="danger" title="Could not create the beneficiary">{error}</Alert>}
                    </CardBody>
                    <CardFooter>
                        <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>Back</Button>
                        <Button type="submit" loading={saving} disabled={!schema} iconRight={ArrowRight}>Save and add bank account</Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
