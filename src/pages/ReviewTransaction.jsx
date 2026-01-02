import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

const ReviewTransaction = ({ user }) => {
    const navigate = useNavigate();
    const { transactionData } = useContext(TransactionContext);
    const { beneficiary, account, paymentMethod, quote } = transactionData;

    const [loading, setLoading] = useState(false);

    // Redirect if missing data
    useEffect(() => {
        if (!beneficiary || !account || !paymentMethod || !quote) {
            // alert('Missing transaction information. Please restart.');
            // navigate('/dashboard');
        }
    }, [beneficiary, account, paymentMethod, quote, navigate]);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            const res = await request('post', '/transactions', {
                userId: user.id || user.userId,
                beneficiaryId: beneficiary?.id,
                accountId: account?.id,
                paymentMethodId: paymentMethod?.id,
                quoteId: quote?.quoteId || quote?.id
            });

            if (res.id) {
                // alert(`Transaction Successful! Status: ${res.status}`);
                navigate('/transaction/receipt', {
                    state: {
                        transaction: res
                    }
                });
            } else {
                throw new Error("No ID returned");
            }
        } catch (err) {
            console.error(err);
            alert('Transaction Failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    if (!quote) return <div className="p-8 text-center">Loading transaction details...</div>;

    return (
        <div className="review-page fade-in">
            <div className="header-section mb-6">
                <h1 className="text-secondary text-3xl font-light mb-2">Summary</h1>
                <p className="text-gray-400">Review your transaction details.</p>
            </div>

            <div className="summary-card bg-white p-6 rounded shadow-sm border border-gray-100 mb-6">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">RECIPIENT</span>
                        <h3 className="text-lg font-bold text-gray-700">{beneficiary?.nickname || beneficiary?.data?.firstName}</h3>
                        <p className="text-gray-500 text-sm">
                            {account?.data?.payoutMethod?.bankCode} • {account?.data?.payoutMethod?.accountNumber}
                        </p>
                    </div>
                    <button className="text-primary text-sm font-bold" onClick={() => navigate('/beneficiaries')}>Edit</button>
                </div>

                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">PAYMENT METHOD</span>
                        <div className="flex items-center gap-2">
                            <span>💳</span>
                            <span className="text-gray-700 font-bold capitalize">{paymentMethod?.token?.schemeId || 'Card'}</span>
                            <span className="text-gray-500 text-sm">•••• {paymentMethod?.token?.lastFourDigits}</span>
                        </div>
                    </div>
                    <button className="text-primary text-sm font-bold" onClick={() => navigate('/payment')}>Edit</button>
                </div>

                <div className="totals-section mt-6">
                    <div className="flex justify-between mb-2">
                        <span className="text-gray-500">Sending Amount</span>
                        <span className="font-bold">{quote.sourceAmount?.amount} {quote.sourceAmount?.currency}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                        <span className="text-gray-500">Fee</span>
                        <span className="font-bold">{quote.totalCost?.amount} {quote.totalCost?.currency}</span>
                    </div>
                    <div className="flex justify-between mb-4">
                        <span className="text-gray-500">Exchange Rate</span>
                        <span className="font-bold text-success">{quote.effectiveRate}</span>
                    </div>
                    <hr className="mb-4" />
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-bold text-gray-700">Total to Pay</span>
                        <span className="text-2xl font-bold text-primary">
                            {(parseFloat(quote.sourceAmount?.amount) + parseFloat(quote.totalCost?.amount)).toFixed(2)} {quote.sourceAmount?.currency}
                        </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <span className="text-lg font-bold text-gray-700">Beneficiary Receives</span>
                        <span className="text-2xl font-bold text-success">
                            {quote.destinationAmount?.amount} {quote.destinationAmount?.currency}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4" style={{ marginTop: '3rem' }}>
                <button onClick={() => navigate(-1)} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                    Back
                </button>
                <button onClick={handleConfirm} disabled={loading} className="btn btn-next px-8 py-3 text-lg rounded-full" style={{ background: 'var(--color-success)' }}>
                    {loading ? 'Processing...' : 'Confirm & Send'}
                </button>
            </div>
        </div>
    );
};

export default ReviewTransaction;
