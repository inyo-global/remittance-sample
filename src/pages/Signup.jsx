import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from '../components/Input';
import { request } from '../api';

const US_STATES = [
    { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' },
    { value: 'CO', label: 'Colorado' }, { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' },
    { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
    { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
    { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' },
    { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
    { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
    { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' },
    { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
    { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
];

const Signup = ({ onLogin }) => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', address: '',
        city: '', state: '', zipcode: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await request('post', '/register', formData);
            if (res.token) {
                localStorage.setItem('authToken', res.token);
            }
            let userData = res.user || res;
            if (userData.id && !userData.userId) {
                userData.userId = userData.id;
            }
            onLogin(userData);
        } catch (err) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in" style={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '1.5rem' }}>
            <div style={{ width: '100%', maxWidth: 560 }}>
                {/* Back */}
                <button
                    type="button"
                    onClick={() => navigate('/login')}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: 500 }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back to login
                </button>

                <div style={{ marginBottom: '1.25rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1A1A2E', marginBottom: '0.25rem' }}>Create your account</h1>
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Fill in the details below to get started.</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Row 1: name */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <Input name="firstName" label="First Name" value={formData.firstName} onChange={handleChange} required />
                        <Input name="lastName" label="Last Name" value={formData.lastName} onChange={handleChange} required />
                    </div>

                    {/* Row 2: email + dob */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <Input name="email" label="Email Address" type="email" value={formData.email} onChange={handleChange} required placeholder="you@example.com" />
                        <Input name="dateOfBirth" label="Date of Birth" type="date" value={formData.dateOfBirth} onChange={handleChange} required />
                    </div>

                    {/* Row 3: password full width */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <Input name="password" label="Password" type="password" value={formData.password} onChange={handleChange} required placeholder="••••••••" />
                    </div>

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid #f0f0f0', margin: '0.75rem 0', position: 'relative' }}>
                        <span style={{ position: 'absolute', top: '-0.55rem', left: 0, background: '#fff', paddingRight: '0.5rem', fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Address</span>
                    </div>

                    {/* Test address checkbox */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            onChange={e => {
                                if (e.target.checked) {
                                    setFormData(prev => ({ ...prev, address: '4429 CANDLEWOOD ST', city: 'LAKEWOOD', state: 'CA', zipcode: '90712' }));
                                } else {
                                    setFormData(prev => ({ ...prev, address: '', city: '', state: '', zipcode: '' }));
                                }
                            }}
                            style={{ width: 15, height: 15, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Use predefined test address</span>
                    </label>

                    {/* Row 4: address full width */}
                    <div style={{ marginBottom: '0.75rem' }}>
                        <Input name="address" label="Address Line 1" value={formData.address} onChange={handleChange} required placeholder="123 Main St" />
                    </div>

                    {/* Row 5: city + state + zip */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <Input name="city" label="City" value={formData.city} onChange={handleChange} required />
                        <Input name="state" label="State" value={formData.state} onChange={handleChange} options={US_STATES} required />
                        <Input name="zipcode" label="Zip" value={formData.zipcode} onChange={handleChange} required placeholder="10001" />
                    </div>

                    {error && (
                        <div style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: '0.6rem 1rem', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            display: 'block',
                            width: '100%',
                            marginTop: '1.25rem',
                            padding: '0.8rem',
                            background: loading ? '#d1fae5' : 'var(--color-success)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 50,
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        {loading ? 'Creating account…' : 'Sign Up'}
                    </button>

                    <p style={{ textAlign: 'center', marginTop: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}>
                            Log in
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default Signup;
