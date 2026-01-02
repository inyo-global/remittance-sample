import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
            onLogin(res);
        } catch (err) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container fade-in">
            <div className="card">
                <h1 className="text-center mb-4">Inyo Demo App</h1>
                <form onSubmit={handleSubmit}>
                    <div className="grid-2">
                        <Input name="firstName" label="First Name" value={formData.firstName} onChange={handleChange} required />
                        <Input name="lastName" label="Last Name" value={formData.lastName} onChange={handleChange} required />
                    </div>
                    <Input name="email" label="Email" type="email" value={formData.email} onChange={handleChange} required />
                    <Input name="password" label="Password" type="password" value={formData.password} onChange={handleChange} required />
                    <Input name="dateOfBirth" label="Date of Birth" type="date" value={formData.dateOfBirth} onChange={handleChange} required />

                    <Input name="address" label="Address Line 1" value={formData.address} onChange={handleChange} required />

                    <div className="grid-2">
                        <Input name="city" label="City" value={formData.city} onChange={handleChange} required />
                        <Input name="state" label="State" value={formData.state} onChange={handleChange} options={US_STATES} required />
                    </div>
                    <Input name="zipcode" label="Zip Code" value={formData.zipcode} onChange={handleChange} required />

                    {error && <div className="text-red mb-4 text-center">{error}</div>}

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? 'Processing...' : 'Sign Up'}
                    </button>

                    <div className="text-center mt-3">
                        <Link to="/login">Already have an account? Login</Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Signup;
