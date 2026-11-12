import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { request } from '../api';
import { errorMessage } from '../lib/format';
import { TEST_ADDRESS, US_STATES } from '../lib/usStates';

const Signup = ({ onLogin }) => {
    const [formData, setFormData] = useState({
        email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', address: '', city: '', state: '', zipcode: '',
    });
    const [useTestAddress, setUseTestAddress] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const toggleTestAddress = (checked) => {
        setUseTestAddress(checked);
        setFormData((prev) => ({ ...prev, ...(checked ? TEST_ADDRESS : { address: '', city: '', state: '', zipcode: '' }) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await request('post', '/register', formData);
            if (res.token) localStorage.setItem('authToken', res.token);
            const userData = { ...(res.user || res) };
            if (userData.id && !userData.userId) userData.userId = userData.id;
            await onLogin(userData);
        } catch (err) {
            setError(errorMessage(err, 'Registration failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            wide
            title="Create your account"
            subtitle="This creates a local login. Your Inyo sender profile (KYC) is completed in the next step."
            footer={
                <>
                    Already have an account?{' '}
                    <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Log in</Link>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                <section className="space-y-4">
                    <p className="kicker">Personal details</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field name="firstName" label="First name" autoComplete="given-name" value={formData.firstName} onChange={handleChange} required />
                        <Field name="lastName" label="Last name" autoComplete="family-name" value={formData.lastName} onChange={handleChange} required />
                        <Field name="email" label="Email address" type="email" autoComplete="email" value={formData.email} onChange={handleChange} required placeholder="you@example.com" />
                        <Field name="dateOfBirth" label="Date of birth" type="date" autoComplete="bday" value={formData.dateOfBirth} onChange={handleChange} required hint="Senders must be 18 or older." />
                    </div>
                    <Field name="password" label="Password" type="password" autoComplete="new-password" value={formData.password} onChange={handleChange} required placeholder="••••••••" />
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <p className="kicker">Residential address (US)</p>
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-500">
                            <input type="checkbox" checked={useTestAddress} onChange={(e) => toggleTestAddress(e.target.checked)} className="size-4 rounded border-ink-300 accent-brand-600" />
                            Use sandbox test address
                        </label>
                    </div>
                    <Field name="address" label="Address line 1" autoComplete="address-line1" value={formData.address} onChange={handleChange} required placeholder="123 Market St" />
                    <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr_0.8fr]">
                        <Field name="city" label="City" autoComplete="address-level2" value={formData.city} onChange={handleChange} required />
                        <Field name="state" label="State" value={formData.state} onChange={handleChange} options={US_STATES} required placeholder="Select" />
                        <Field name="zipcode" label="ZIP code" autoComplete="postal-code" value={formData.zipcode} onChange={handleChange} required placeholder="94105" />
                    </div>
                </section>

                {error && <Alert tone="danger">{error}</Alert>}

                <Button type="submit" loading={loading} iconRight={ArrowRight} className="w-full" size="lg">
                    Create account
                </Button>
            </form>
        </AuthShell>
    );
};

export default Signup;
