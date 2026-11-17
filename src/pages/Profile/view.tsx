import { ArrowRight, Save, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '../../components/ui/Card';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import { US_STATES } from '../../lib/usStates';
import { COUNTRIES, DOC_TYPES, type ProfileViewProps } from './model';

export default function ProfileView({ hasProfile, formData, loading, fetching, error, isLicense, handleChange, handleSubmit }: ProfileViewProps) {
    if (fetching) return <Spinner label="Loading profile…" />;

    return (
        <div className="mx-auto max-w-3xl">
            <PageHeader
                kicker="My profile"
                title={hasProfile ? 'Personal information' : 'Complete your sender profile'}
                description={hasProfile ? 'Changes are synced to your Inyo sender record.' : 'Inyo runs KYC on this data and assigns your compliance level and sending limits.'}
            />

            {!hasProfile && (
                <Alert tone="info" className="mb-6" title="One step before sending money">
                    Fill in your identity details so Inyo can verify you. Use a sandbox-reserved document number to simulate a given KYC outcome.
                </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                <Card>
                    <CardHeader title="Personal details" description="Name and contact as they appear on your ID." />
                    <CardBody className="grid gap-4 sm:grid-cols-2">
                        <Field name="firstName" label="First name" value={formData.firstName} onChange={handleChange} required />
                        <Field name="lastName" label="Last name" value={formData.lastName} onChange={handleChange} required />
                        <Field name="email" label="Email" type="email" value={formData.email} onChange={handleChange} required disabled hint="Email is your login and cannot be changed here." />
                        <Field name="phoneNumber" label="Mobile number" value={formData.phoneNumber} onChange={handleChange} placeholder="+1 555 123 4567" hint="E.164 format with country code." required />
                        <Field name="address" label="Address line 1" value={formData.address} onChange={handleChange} required className="sm:col-span-2" />
                        <Field name="city" label="City" value={formData.city} onChange={handleChange} required />
                        <div className="grid gap-4 grid-cols-[1fr_0.8fr]">
                            <Field name="state" label="State" value={formData.state} onChange={handleChange} options={US_STATES} required placeholder="Select" />
                            <Field name="zipcode" label="ZIP code" value={formData.zipcode} onChange={handleChange} required />
                        </div>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader
                        title="Identity & verification"
                        description="Required to reach compliance level 2 and higher limits."
                        action={<ShieldCheck className="size-5 text-brand-500" aria-hidden />}
                    />
                    <CardBody className="grid gap-4 sm:grid-cols-2">
                        <Field name="gender" label="Gender" value={formData.gender} onChange={handleChange} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} required />
                        <Field name="occupation" label="Occupation" value={formData.occupation} onChange={handleChange} required placeholder="Software engineer" />
                        <Field name="docType" label="Identity document" value={formData.docType} onChange={handleChange} options={DOC_TYPES} required />
                        <Field name="docNumber" label={isLicense ? 'License number' : 'Passport number'} value={formData.docNumber} onChange={handleChange} required />
                        {isLicense ? (
                            <Field name="state" label="Issuing state" value={formData.state} onChange={handleChange} options={US_STATES} required hint="Uses your residential state." />
                        ) : (
                            <Field name="issuingCountry" label="Issuing country" value={formData.issuingCountry} onChange={handleChange} options={COUNTRIES} required />
                        )}
                        <Field name="expirationDate" label="Expiration date" type="date" value={formData.expirationDate} onChange={handleChange} required />
                        <Field
                            name="ssn"
                            label="Social Security number"
                            value={formData.ssn}
                            onChange={handleChange}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder={formData.ssnLast4 ? `On file (•••-••-${formData.ssnLast4}); enter to replace` : '078-05-1120'}
                            hint="Optional. Needed for Level 2 together with a verified ID. Sent as a declared document (type ssn); never shown again after saving."
                        />
                    </CardBody>
                    {error && (
                        <div className="px-6 pb-5">
                            <Alert tone="danger" title="Could not sync with Inyo">{error}</Alert>
                        </div>
                    )}
                    <CardFooter>
                        <p className="text-xs text-ink-500">Sandbox note: reserved numbers pass the KYC format check — passport 999000001 (US), driver&apos;s license 99900001 (US, PA only). To also decide a KYC widget session without a camera use passport 999003001 (approved) or driver&apos;s license 99900101 (approved, PA). SSN test value: 078-05-1120.</p>
                        <Button type="submit" loading={loading} icon={hasProfile ? Save : undefined} iconRight={hasProfile ? undefined : ArrowRight}>
                            {hasProfile ? 'Save changes' : 'Save and continue'}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}
