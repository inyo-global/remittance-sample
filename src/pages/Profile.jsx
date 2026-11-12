import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Save, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardFooter, CardHeader } from '../components/ui/Card';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { useToast } from '../lib/toast';
import { request } from '../api';
import { errorMessage } from '../lib/format';
import { US_STATES } from '../lib/usStates';

const COUNTRIES = [
    { value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' },
    { value: 'BR', label: 'Brazil' }, { value: 'CL', label: 'Chile' }, { value: 'PE', label: 'Peru' }, { value: 'CO', label: 'Colombia' },
];

const DOC_TYPES = [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: "Driver's license" },
];

const EMPTY = {
    firstName: '', lastName: '', email: '', address: '', city: '', state: '', zipcode: '', phoneNumber: '',
    gender: 'male', occupation: '', docType: 'passport', docNumber: '', issuingCountry: 'US', expirationDate: '', ssn: '',
};

/**
 * Sender onboarding. Submitting creates (or patches) the Person in Inyo through
 * the BFF, which stores the returned id as the sender's externalId.
 */
const Profile = ({ user, hasProfile, onSaved }) => {
    const navigate = useNavigate();
    const toast = useToast();
    const [formData, setFormData] = useState(EMPTY);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        request('get', '/profile')
            .then((res) => {
                if (cancelled) return;
                const extra = res.profile?.data ? JSON.parse(res.profile.data) : {};
                setFormData((prev) => ({
                    ...prev,
                    firstName: res.user?.firstName || '',
                    lastName: res.user?.lastName || '',
                    email: res.user?.email || '',
                    address: res.user?.address || '',
                    city: res.user?.city || '',
                    zipcode: res.user?.zipcode || '',
                    state: extra.state || res.user?.state || '',
                    phoneNumber: res.user?.phoneNumber || extra.phoneNumber || '',
                    gender: res.profile?.gender || 'male',
                    occupation: res.profile?.occupation || '',
                    docType: res.profile?.docType || 'passport',
                    docNumber: res.profile?.docNumber || '',
                    issuingCountry: extra.originalIssuingCountry || res.profile?.issuingCountry || 'US',
                    expirationDate: res.profile?.expirationDate || '',
                    ssn: '',
                    ssnLast4: res.profile?.ssnLast4 || null,
                }));
            })
            .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load your profile')))
            .finally(() => !cancelled && setFetching(false));
        return () => { cancelled = true; };
    }, [user?.userId]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await request('post', '/complete-profile', formData);
            const digits = formData.ssn.replace(/\D/g, '');
            if (digits) setFormData((prev) => ({ ...prev, ssn: '', ssnLast4: digits.slice(-4) }));
            onSaved?.({ firstName: formData.firstName, lastName: formData.lastName, address: formData.address, city: formData.city, state: formData.state, zipcode: formData.zipcode, phoneNumber: formData.phoneNumber });
            toast.success(hasProfile ? 'Profile updated' : 'Profile created', 'Your sender profile was synced with Inyo.');
            if (!hasProfile) navigate('/dashboard');
        } catch (err) {
            setError(errorMessage(err?.details || err, 'Failed to save profile'));
        } finally {
            setLoading(false);
        }
    };

    if (fetching) return <Spinner label="Loading profile…" />;

    const isLicense = formData.docType === 'driver_license';

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
};

export default Profile;
