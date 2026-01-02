import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/Input';
import { request } from '../api';

const COUNTRIES = [
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' },
    { value: 'MX', label: 'Mexico' },
    { value: 'BR', label: 'Brazil' },
    { value: 'CL', label: 'Chile' },
    { value: 'PE', label: 'Peru' }
];

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

const Profile = ({ user }) => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        firstName: '', lastName: '', email: '', address: '', city: '', zipcode: '', phoneNumber: '',
        gender: 'male',
        occupation: '',
        docType: 'passport',
        docNumber: '',
        issuingCountry: '',
        expirationDate: '',
        state: ''
    });
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user?.userId) return;
            try {
                const res = await request('get', `/profile?userId=${user.userId}`);
                if (res.user) {
                    setFormData(prev => ({
                        ...prev,
                        firstName: res.user.firstName || '',
                        lastName: res.user.lastName || '',
                        email: res.user.email || '',
                        address: res.user.address || '',
                        city: res.user.city || '',
                        zipcode: res.user.zipcode || '',
                        phoneNumber: res.user.phoneNumber || (res.profile?.data ? JSON.parse(res.profile.data).phoneNumber : '') || '',
                    }));
                }
                if (res.profile) {
                    setFormData(prev => ({
                        ...prev,
                        gender: res.profile.gender || 'male',
                        occupation: res.profile.occupation || '',
                        docType: res.profile.docType || 'passport',
                        docNumber: res.profile.docNumber || '',
                        issuingCountry: res.profile.issuingCountry || '',
                        expirationDate: res.profile.expirationDate || '',
                        state: res.profile.data ? JSON.parse(res.profile.data).state : (res.user?.state || '')
                    }));
                }
            } catch (error) {
                console.error("Error fetching profile", error);
            } finally {
                setFetching(false);
            }
        };
        fetchProfile();
    }, [user]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await request('post', '/complete-profile', {
                userId: user.userId,
                ...formData
            });
            navigate('/dashboard');
        } catch (err) {
            alert('Failed to update profile: ' + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    if (fetching) return <div className="loader"></div>;

    return (
        <div className="container fade-in">
            <div className="card">
                <h2 className="mb-4">My Profile</h2>
                <p className="mb-4 text-muted">Manage your personal information.</p>

                <form onSubmit={handleSubmit}>
                    <div className="mb-6 border-b pb-4">
                        <h3 className="text-lg font-bold text-gray-700 mb-3">Personal Information</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <Input name="firstName" label="First Name" value={formData.firstName} onChange={handleChange} required />
                            <Input name="lastName" label="Last Name" value={formData.lastName} onChange={handleChange} required />
                        </div>
                        <Input name="email" label="Email" value={formData.email} onChange={handleChange} required />
                        <Input name="phoneNumber" label="Mobile Number" value={formData.phoneNumber} onChange={handleChange} placeholder="e.g. +1 555 123 4567" required />
                        <Input name="address" label="Address" value={formData.address} onChange={handleChange} required />
                        <div className="grid grid-cols-3 gap-4">
                            <Input name="city" label="City" value={formData.city} onChange={handleChange} required />
                            {/* State is handled below in Identity section logic usually, but let's just make it generic text here if not doc-bound? 
                                 Actually, for simplicity, let's keep State in the ID section as it was logic-bound there. 
                                 Or duplicate display? */}
                            <Input name="zipcode" label="Zip Code" value={formData.zipcode} onChange={handleChange} required />
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-700 mb-3">Identity & Verification</h3>
                    <Input
                        name="gender"
                        label="Gender"
                        value={formData.gender}
                        onChange={handleChange}
                        options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]}
                        required
                    />
                    <Input name="occupation" label="Occupation" value={formData.occupation} onChange={handleChange} required />

                    <Input
                        name="docType"
                        label="Identity Document"
                        value={formData.docType}
                        onChange={handleChange}
                        options={[
                            { value: 'passport', label: 'Passport' },
                            { value: 'driver_license', label: "Driver's License" }
                        ]}
                        required
                    />

                    {formData.docType === 'passport' ? (
                        <>
                            <Input
                                name="docNumber"
                                label="Passport Number"
                                value={formData.docNumber}
                                onChange={handleChange}
                                required
                            />
                            <Input
                                name="issuingCountry"
                                label="Issuing Country"
                                value={formData.issuingCountry}
                                onChange={handleChange}
                                options={COUNTRIES}
                                required
                            />
                        </>
                    ) : (
                        <>
                            <Input
                                name="docNumber"
                                label="Document Number"
                                value={formData.docNumber}
                                onChange={handleChange}
                                required
                            />
                            <Input
                                name="state"
                                label="Issuing State"
                                value={formData.state}
                                onChange={handleChange}
                                options={US_STATES}
                                required
                            />
                        </>
                    )}

                    <Input name="expirationDate" label="Expiration Date" type="date" value={formData.expirationDate} onChange={handleChange} required />

                    <button type="submit" className="btn btn-primary mt-4" disabled={loading}>
                        {loading ? 'Saving...' : 'Continue to Dashboard'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Profile;
