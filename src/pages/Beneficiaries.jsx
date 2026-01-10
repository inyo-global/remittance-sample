import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

const Beneficiaries = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setTransactionData } = useContext(TransactionContext);
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        request('get', `/beneficiaries?userId=${user.id || user.userId}`)
            .then(data => setBeneficiaries(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [user]);

    const handleSelect = (ben) => {
        setTransactionData(prev => ({ ...prev, beneficiary: ben }));
        navigate(`/beneficiaries/${ben.id}/account`);
    };

    const targetCountry = location.state?.countryCode;

    // Filter beneficiaries if a target country is specified
    const displayedBeneficiaries = targetCountry
        ? beneficiaries.filter(ben => ben.data?.address?.countryCode === targetCountry)
        : beneficiaries;

    return (
        <div className="beneficiaries-page fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-secondary text-3xl font-light mb-2">My Beneficiaries</h1>
                    <p className="text-gray-400">
                        {targetCountry
                            ? `Showing beneficiaries in ${targetCountry}`
                            : 'Select a beneficiary to send money to.'}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/beneficiaries/new', { state: location.state })}
                    className="btn btn-primary rounded-full px-6 py-2"
                    style={{ background: 'var(--color-primary)' }}
                >
                    + Add New
                </button>
            </div>

            {loading ? <div className="loader"></div> : (
                <div className="grid grid-cols-1 gap-4">
                    {displayedBeneficiaries.length === 0 ? (
                        <div className="text-center p-8 border rounded text-gray-400">
                            {targetCountry
                                ? `No beneficiaries found in ${targetCountry}. Add one to get started.`
                                : 'No beneficiaries found. Add one to get started.'}
                        </div>
                    ) : (
                        displayedBeneficiaries.map(ben => (
                            <div
                                key={ben.id}
                                onClick={() => handleSelect(ben)}
                                className="bg-white p-4 rounded border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all flex justify-between items-center"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                                        {ben.nickname?.charAt(0) || ben.data?.firstName?.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-700">{ben.nickname || `${ben.data?.firstName} ${ben.data?.lastName}`}</h3>
                                        <p className="text-sm text-gray-400">{ben.data?.address?.countryCode}</p>
                                    </div>
                                </div>
                                <span className="text-primary font-bold">Select ›</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            <style>{`
                 /* Optional: grid styles if generic classes aren't enough */
             `}</style>
        </div>
    );
};

export default Beneficiaries;
