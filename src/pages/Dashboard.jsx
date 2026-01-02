import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

const Dashboard = ({ user }) => {
    const navigate = useNavigate();
    const { transactionData, setTransactionData } = useContext(TransactionContext);

    const [destinations, setDestinations] = useState([]);
    const [amount, setAmount] = useState(100);
    const [currency, setCurrency] = useState('');
    const [countryCode, setCountryCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingDest, setLoadingDest] = useState(true);

    // Initial load
    useEffect(() => {
        request('get', '/destinations')
            .then(data => {
                const list = data.countryDestinations || (Array.isArray(data) ? data : []) || [];
                setDestinations(list);
                if (list.length > 0) {
                    // Default to first usually, or specific like Argentina in Screenshot
                    const defaultDest = list.find(d => d.country === 'AR') || list[0];
                    setCountryCode(defaultDest.country);
                    setCurrency(defaultDest.currency || defaultDest.code);
                }
            })
            .catch(console.error)
            .finally(() => setLoadingDest(false));
    }, []);

    // State to track if current input has been quoted
    const [quoteError, setQuoteError] = useState(null);

    // Reset quote when inputs change
    useEffect(() => {
        setTransactionData(prev => ({ ...prev, quote: null }));
    }, [amount, currency, setTransactionData]);

    const handleGetQuote = async () => {
        if (!amount || !currency) return;
        setLoading(true);
        setQuoteError(null);
        try {
            const res = await request('post', '/quotes', {
                userId: user.id || user.userId,
                fromCurrency: 'USD',
                toCurrency: currency,
                amount
            });
            const quote = res.quotes ? res.quotes[0] : (res.id ? res : null);
            if (quote) {
                setTransactionData(prev => ({ ...prev, quote }));
            } else {
                setQuoteError('No quote available.');
            }
        } catch (err) {
            console.error(err);
            setQuoteError(err.message || 'Failed to get quote');
        } finally {
            setLoading(false);
        }
    };

    const handleProceed = () => {
        if (!transactionData?.quote) return;
        // Ensuring countryCode is passed to beneficiaries for Schema loading
        navigate('/beneficiaries', { state: { countryCode } });
    };

    const handleCountryChange = (e) => {
        const code = e.target.value;
        setCountryCode(code);
        const dest = destinations.find(d => d.country === code);
        if (dest) setCurrency(dest.currency || dest.code);
    }

    const quoteValue = transactionData?.quote ?
        (transactionData.quote.mode === 'INVERSE' ? transactionData.quote.sourceAmount.amount : (transactionData.quote.destinationAmount?.amount || transactionData.quote.targetAmount?.amount))
        : '';

    return (
        <div className="dashboard-page fade-in">
            <div className="welcome-header mb-8">
                <h1 className="text-secondary text-3xl font-light mb-2">Welcome!</h1>
                <p className="text-xl text-gray-500 font-light">
                    {transactionData?.quote ? (
                        <>The current exchange rate to <span className="font-bold text-black">{countryCode}</span> is <span className="font-bold text-black">1 USD = {transactionData.quote.effectiveRate} {currency}</span></>
                    ) : (
                        `Select country and amount to get a quote.`
                    )}
                </p>
            </div>

            <div className="enter-amount-section">
                <h2 className="text-gray-500 font-normal text-2xl mb-2">Enter amount</h2>
                <p className="text-gray-400 text-sm mb-6">Send money securely and fast.</p>

                <div className="form-group mb-4">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">COUNTRY</label>
                    <select
                        value={countryCode}
                        onChange={handleCountryChange}
                        className="w-full p-3 border border-gray-300 rounded text-lg bg-white appearance-none"
                    >
                        {destinations.map(d => (
                            <option key={d.country} value={d.country}>{d.countryName}</option>
                        ))}
                    </select>
                </div>

                <div className="amount-inputs flex items-end gap-4 mb-4">
                    <div className="input-wrap flex-1 relative">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">YOU SEND</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full p-4 border border-gray-300 rounded text-xl"
                                placeholder="100.00"
                            />
                            <span className="currency-tag absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 font-bold">USD</span>
                        </div>
                    </div>

                    <div className="mb-1">
                        <button
                            onClick={handleGetQuote}
                            disabled={loading || !amount}
                            className={`btn px-6 py-4 rounded font-bold transition-all ${loading || !amount ? 'bg-gray-200 text-gray-400' : 'bg-primary text-white hover:bg-primary-dark'}`}
                            style={{ height: '58px' }} // Match input height roughly
                        >
                            {loading ? '...' : 'Quote'}
                        </button>
                    </div>

                    <div className="input-wrap flex-1 relative">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">THEY RECEIVE</label>
                        <div className="relative">
                            <input
                                type="text"
                                readOnly
                                value={quoteValue}
                                className="w-full p-4 border border-gray-300 rounded text-xl bg-gray-50"
                                placeholder="..."
                            />
                            <span className="currency-tag absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 font-bold">{currency}</span>
                        </div>
                    </div>
                </div>

                {quoteError && <p className="text-red-500 mb-4">{quoteError}</p>}

                <div className="flex justify-end" style={{ marginTop: '3rem' }}>
                    <button
                        onClick={handleProceed}
                        disabled={!transactionData?.quote || loading}
                        className={`btn px-8 py-3 text-lg rounded-full transition-all ${!transactionData?.quote ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'btn-success text-white'}`}
                        style={transactionData?.quote ? { background: 'var(--color-success)' } : {}}
                    >
                        Next
                    </button>
                    <style>{`
                        .welcome-header h1 { color: var(--color-success); font-weight: 300; font-size: 40px; }
                     `}</style>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
