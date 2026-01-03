import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Input from '../components/Input';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

const AddAccount = ({ user }) => {
    const { id } = useParams(); // Beneficiary ID
    const { state } = useLocation();
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useContext(TransactionContext);

    const [schema, setSchema] = useState(null);
    const [formData, setFormData] = useState({});
    const [banks, setBanks] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [view, setView] = useState('loading'); // loading, list, add
    const [loading, setLoading] = useState(true);

    const countryCode = state?.countryCode || transactionData.beneficiary?.data?.address?.countryCode || transactionData.beneficiary?.address?.countryCode || 'PE';

    // Fetch Accounts and Schema
    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                // Fetch existing accounts
                const accountsRes = await request('get', `/beneficiaries/${id}/accounts`);
                setAccounts(accountsRes);

                // If we have accounts, show list, otherwise show add form
                if (accountsRes.length > 0) {
                    setView('list');
                } else {
                    setView('add');
                }

                // Pre-fetch schema and banks for "add" mode
                const schemaRes = await request('get', `/beneficiaries/account-schema/${countryCode.toLowerCase()}`);
                setSchema(schemaRes);

                // Fetch banks
                const banksRes = await request('get', `/banks/${countryCode.toLowerCase()}`);
                if (banksRes.items) {
                    setBanks(banksRes.items);
                }
            } catch (err) {
                console.error('Error loading data', err);
                // Fallback to add view if error fetching accounts (or if empty)
                setView('add');
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [id, countryCode]);

    const handleNestedChange = (path, value) => {
        setFormData(prev => {
            const newState = { ...prev };
            let current = newState;
            const keys = path.split('.');
            const lastKey = keys.pop();

            keys.forEach(key => {
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

    const getValue = (path) => {
        let current = formData;
        const keys = path.split(/\.|\[|\]/).filter(Boolean);
        for (const key of keys) {
            if (current === undefined || current === null) return '';
            current = current[key];
        }
        return current || '';
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
            return (
                <div key={fullPath} className="json-form-group border p-4 rounded mb-4 bg-gray-50">
                    <h4 className="capitalize font-bold mb-2 text-primary">{prop.title || key}</h4>
                    {Object.keys(prop.items.properties).map(childKey => {
                        const arrayPath = `${key}[0]`;
                        return renderField(childKey, prop.items.properties[childKey], arrayPath, prop.items.required?.includes(childKey));
                    })}
                </div>
            );
        }

        // Determine options
        let fieldOptions = prop.enum ? prop.enum.map(v => ({ value: v, label: v })) : null;

        // Inject banks if key is bankCode
        if (key === 'bankCode' && banks.length > 0) {
            fieldOptions = banks.map(b => ({ value: b.code, label: b.name }));
        }

        return (
            <Input
                key={fullPath}
                name={fullPath}
                label={prop.title || key}
                value={getValue(fullPath)}
                onChange={(e) => handleNestedChange(fullPath, e.target.value)}
                required={isRequired}
                placeholder={prop.description}
                options={fieldOptions}
            />
        );
    };

    const handleSelectAccount = (account) => {
        setTransactionData(prev => ({ ...prev, account }));
        navigate('/payment');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newAccount = await request('post', '/beneficiaries/account', {
                beneficiaryId: id,
                externalPersonId: state?.beneficiary?.externalId,
                formData
            });
            // Auto Select and Proceed
            console.log('Account added, auto-selecting:', newAccount);
            setTransactionData(prev => ({ ...prev, account: newAccount }));
            navigate('/payment');
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };



    return (
        <div className="add-account-page fade-in">
            <div className="header-section mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-secondary text-3xl font-light mb-2">Delivery Options</h1>
                    <p className="text-gray-400">Select a bank account or add a new one.</p>
                </div>
                {view === 'list' && (
                    <button
                        onClick={() => setView('add')}
                        className="btn rounded-full px-6 py-2 text-sm font-bold flex items-center gap-2 transition-all hover:shadow-md"
                        style={{ backgroundColor: '#f3f4f6', color: 'var(--color-primary)' }}
                    >
                        <span className="text-xl">+</span> Add New
                    </button>
                )}
            </div>

            {loading ? <div className="loader"></div> : (
                view === 'list' ? (
                    <div className="account-list">
                        {accounts.map(acc => (
                            <div
                                key={acc.id}
                                onClick={(e) => {
                                    e.preventDefault();
                                    console.log('Selecting account:', acc);
                                    handleSelectAccount(acc);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleSelectAccount(acc);
                                    }
                                }}
                                className="bg-white p-4 rounded border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all flex justify-between items-center mb-4"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-2xl">
                                        🏦
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-700">{acc.data?.payoutMethod?.bankCode || 'Bank Account'}</h3>
                                        <p className="text-sm text-gray-400">
                                            {acc.data?.payoutMethod?.accountNumber || acc.data?.payoutMethod?.clabe || '****'} • {acc.data?.asset}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-primary font-bold">Select ›</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="add-form">
                        <form onSubmit={handleSubmit}>
                            {schema && schema.properties && Object.keys(schema.properties).map(k => renderField(k, schema.properties[k]))}

                            <div className="flex justify-between" style={{ marginTop: '3rem' }}>
                                <button type="button" onClick={() => setView('list')} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                                    Back
                                </button>
                                <button type="submit" className="btn btn-next px-8 py-3 text-lg rounded-full" style={{ background: 'var(--color-success)' }}>
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                )
            )}
        </div>
    );
};

export default AddAccount;
