import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Input from '../components/Input';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

const AddBeneficiary = ({ user }) => {
    const { state } = useLocation();
    const navigate = useNavigate();
    const { setTransactionData } = useContext(TransactionContext);

    const [schema, setSchema] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);

    const countryCode = state?.countryCode || 'PE';

    useEffect(() => {
        request('get', `/beneficiaries/schema/${countryCode.toLowerCase()}`)
            .then(res => {
                setSchema(res);
                // Initialize defaults if needed
            })
            .catch(err => alert('Error loading schema: ' + err.message))
            .finally(() => setLoading(false));
    }, [countryCode]);

    const handleNestedChange = (path, value) => {
        setFormData(prev => {
            const newState = { ...prev };
            let current = newState;
            const keys = path.split('.');
            const lastKey = keys.pop();

            keys.forEach(key => {
                // If the key implies an array index (e.g., "documents[0]"), parse it
                const arrayMatch = key.match(/(\w+)\[(\d+)\]/);
                if (arrayMatch) {
                    const [_, arrayName, index] = arrayMatch;
                    if (!current[arrayName]) current[arrayName] = [];
                    if (!current[arrayName][index]) current[arrayName][index] = {};
                    current = current[arrayName][index];
                } else {
                    if (!current[key]) current[key] = {};
                    current = current[key];
                }
            });

            current[lastKey] = value;
            return newState;
        });
    };

    const renderField = (key, prop, path, required = false) => {
        const fullPath = path ? `${path}.${key}` : key;
        const isRequired = required;

        if (prop.type === 'object') {
            return (
                <div key={fullPath} className="json-form-group border p-4 rounded mb-4 bg-gray-50">
                    <h4 className="capitalize font-bold mb-2 text-primary">{prop.title || key}</h4>
                    {Object.keys(prop.properties).map(childKey =>
                        renderField(childKey, prop.properties[childKey], fullPath, prop.required?.includes(childKey))
                    )}
                </div>
            );
        }

        if (prop.type === 'array' && prop.items) {
            // Simplify: Render just one item for the array for this demo
            // In a real app, we'd have Add/Remove buttons
            return (
                <div key={fullPath} className="json-form-group border p-4 rounded mb-4 bg-gray-50">
                    <h4 className="capitalize font-bold mb-2 text-primary">{prop.title || key}</h4>
                    {Object.keys(prop.items.properties).map(childKey => {
                        // Construct path as "documents[0].type"
                        // But for our simplified nested handler, let's use a notation we can parse or just flat "documents.0.type"
                        // Let's us specific keys for our handleNestedChange: "documents[0]"
                        const arrayPath = `${key}[0]`;
                        return renderField(childKey, prop.items.properties[childKey], arrayPath, prop.items.required?.includes(childKey));
                    })}
                </div>
            );
        }

        // Primitive types
        return (
            <Input
                key={fullPath}
                name={fullPath}
                label={prop.title || key}
                value={getValue(fullPath)}
                onChange={(e) => handleNestedChange(fullPath, e.target.value)}
                required={isRequired}
                placeholder={prop.description}
                options={prop.enum ? prop.enum.map(v => ({ value: v, label: v })) : null}
            />
        );
    };

    const getValue = (path) => {
        // Resolve path "address.city" or "documents[0].type" from formData
        let current = formData;
        // Split by dot or bracket notation
        const keys = path.split(/\.|\[|\]/).filter(Boolean); // "documents[0].type" -> ["documents", "0", "type"]

        for (const key of keys) {
            if (current === undefined || current === null) return '';
            current = current[key];
        }
        return current || '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await request('post', '/beneficiaries', {
                userId: user.userId,
                nickname: `${formData.firstName} ${formData.lastName}`,
                countryCode,
                formData
            });
            // Update Context
            setTransactionData(prev => ({ ...prev, beneficiary: res }));
            // Proceed to add Account
            navigate(`/beneficiaries/${res.id}/account`, { state: { ...state, beneficiary: res } });
        } catch (err) {
            alert('Failed to add beneficiary: ' + (err.response?.data?.error || err.message));
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (

        <div className="add-beneficiary-page fade-in">
            <div className="header-section mb-6">
                <h1 className="text-secondary text-3xl font-light mb-2">Enter Beneficiary</h1>
            </div>

            <div className="form-container">
                {/* Search / Select existing - Mockup shows "Choose beneficiary" dropdown */}
                <div className="form-group mb-6">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">BENEFICIARY</label>
                    <div className="relative">
                        <input className="w-full p-3 border border-gray-300 rounded text-lg bg-white" placeholder="Choose beneficiary" />
                        <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary font-bold">▼</span>
                    </div>
                </div>

                <hr className="border-gray-200 mb-6" />

                {loading ? <div className="loader"></div> : (
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-2-cols gap-6 mb-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">*NAME</label>
                                <input
                                    className="w-full p-3 border border-gray-300 rounded text-lg"
                                    value={formData.firstName || ''}
                                    onChange={e => handleNestedChange('firstName', e.target.value)}
                                // defaultValue={state?.beneficiary?.data?.firstName} 
                                // if editing...
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">*LAST NAME</label>
                                <input
                                    className="w-full p-3 border border-gray-300 rounded text-lg"
                                    value={formData.lastName || ''}
                                    onChange={e => handleNestedChange('lastName', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">ADDRESS</label>
                            <input
                                className="w-full p-3 border border-gray-300 rounded text-lg"
                                value={formData.address || ''}
                                onChange={e => handleNestedChange('address', e.target.value)}
                            />
                        </div>

                        <div className="grid grid-2-cols gap-6 mb-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">ADDITIONAL</label>
                                <input
                                    className="w-full p-3 border border-gray-300 rounded text-lg"
                                    value={formData.additional || ''}
                                    onChange={e => handleNestedChange('additional', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">MOBILE</label>
                                <input
                                    className="w-full p-3 border border-gray-300 rounded text-lg"
                                    placeholder="Numbers only"
                                    value={formData.mobile || ''}
                                    onChange={e => handleNestedChange('mobile', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-2-cols gap-6 mb-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">*STATE</label>
                                <div className="relative">
                                    <select
                                        className="w-full p-3 border border-gray-300 rounded text-lg appearance-none bg-white"
                                        value={formData.state || ''}
                                        onChange={e => handleNestedChange('state', e.target.value)}
                                    >
                                        <option>Select an option</option>
                                        <option value="FL">Florida</option>
                                        <option value="NY">New York</option>
                                        {/* Populate dynamically */}
                                    </select>
                                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary font-bold">▼</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">*CITY</label>
                                <div className="relative">
                                    <select
                                        className="w-full p-3 border border-gray-300 rounded text-lg appearance-none bg-white"
                                        value={formData.city || ''}
                                        onChange={e => handleNestedChange('city', e.target.value)}
                                    >
                                        <option>Select a city</option>
                                        {/* Populate dynamically */}
                                    </select>
                                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary font-bold">▼</span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-8">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">EMAIL</label>
                            <input
                                type="email"
                                className="w-full p-3 border border-gray-300 rounded text-lg"
                                value={formData.email || ''}
                                onChange={e => handleNestedChange('email', e.target.value)}
                            />
                        </div>

                        <div className="flex justify-between" style={{ marginTop: '3rem' }}>
                            <button type="button" onClick={() => navigate(-1)} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                                Back
                            </button>
                            <button type="submit" className="btn btn-next px-8 py-3 text-lg rounded-full" style={{ background: 'var(--color-success)' }}>
                                Next
                            </button>
                        </div>
                    </form>
                )}
            </div>

            <style>{`
                .grid-2-cols { grid-template-columns: 1fr 1fr; }
                .text-secondary { color: #666; } /* Welcome text color from dashboard seems gray actually? "Welcome, Robson" is white in Sidebar, but "Welcome!" in dashboard is green */
                /* Wait, in Screenshot 2, "Welcome!" text is Green. I styled it Green in Dashboard. */
                /* In Screenshot 1 (Beneficiary), "Enter Beneficiary" is Gray/Dark Gray. */
            `}</style>
        </div>
    );
};

export default AddBeneficiary;
