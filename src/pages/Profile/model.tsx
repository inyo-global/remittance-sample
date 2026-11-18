import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast, useSession } from '../../hooks';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import type { Option } from '../../lib/usStates';
import type { ProfileResponse } from '../../types';

interface ProfileForm {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipcode: string;
    phoneNumber: string;
    email: string;
    gender: string;
    occupation: string;
    docType: string;
    docNumber: string;
    issuingCountry: string;
    expirationDate: string;
    ssn: string;
    ssnLast4?: string | null;
}

/** Extra fields the BFF keeps in profiles.data (JSON) alongside the Inyo sender payload. */
interface ProfileExtra {
    state?: string;
    phoneNumber?: string;
    originalIssuingCountry?: string;
}

export const COUNTRIES: Option[] = [
    { value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' },
    { value: 'BR', label: 'Brazil' }, { value: 'CL', label: 'Chile' }, { value: 'PE', label: 'Peru' }, { value: 'CO', label: 'Colombia' },
];

export const DOC_TYPES: Option[] = [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: "Driver's license" },
];

const EMPTY: ProfileForm = {
    firstName: '', lastName: '', email: '', address: '', city: '', state: '', zipcode: '', phoneNumber: '',
    gender: 'male', occupation: '', docType: 'passport', docNumber: '', issuingCountry: 'US', expirationDate: '', ssn: '',
};

/**
 * Sender onboarding. Submitting creates (or patches) the Person in Inyo through
 * the BFF, which stores the returned id as the sender's externalId.
 */
export function useProfile() {
    const { user, hasProfile, profileSaved } = useSession();
    const navigate = useNavigate();
    const toast = useToast();
    const [formData, setFormData] = useState<ProfileForm>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        request<ProfileResponse>('get', '/profile')
            .then((res) => {
                if (cancelled) return;
                const extra: ProfileExtra = res.profile?.data ? JSON.parse(res.profile.data) : {};
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

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await request('post', '/complete-profile', formData);
            const digits = formData.ssn.replace(/\D/g, '');
            if (digits) setFormData((prev) => ({ ...prev, ssn: '', ssnLast4: digits.slice(-4) }));
            profileSaved({ firstName: formData.firstName, lastName: formData.lastName, address: formData.address, city: formData.city, state: formData.state, zipcode: formData.zipcode, phoneNumber: formData.phoneNumber });
            toast.success(hasProfile ? 'Profile updated' : 'Profile created', 'Your sender profile was synced with Inyo.');
            if (!hasProfile) navigate('/dashboard');
        } catch (err) {
            // Some BFF errors nest the useful message under `details`.
            const details = typeof err === 'object' && err !== null && 'details' in err ? (err as { details?: unknown }).details : undefined;
            setError(errorMessage(details || err, 'Failed to save profile'));
        } finally {
            setLoading(false);
        }
    };

    const isLicense = formData.docType === 'driver_license';

    return { hasProfile, formData, loading, fetching, error, isLicense, handleChange, handleSubmit };
}

export type ProfileViewProps = ReturnType<typeof useProfile>;
