import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { request } from '../api';

const Receipt = ({ user }) => {
    const { state } = useLocation();
    const navigate = useNavigate();

    // Initial state from navigation, or null
    const [transaction, setTransaction] = useState(state?.transaction || null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // If no transaction at all, go back
        if (!state?.transaction && !transaction) {
            navigate('/dashboard');
            return;
        }

        // Check if we have rich data (e.g. sender). 
        // If not (stale server returned only ID/Status), fetch it.
        const checkAndFetch = async () => {
            setLoading(true);
            try {
                const updatedTx = await request('get', `/transactions?userId=${user.id || user.userId}`);
                // Find our transaction
                const match = updatedTx.find(t => t.id === transaction.id || t.externalId === transaction.id);
                if (match) {
                    console.log("Receipt: Found rich data from history.");
                    setTransaction(match);
                }
            } catch (e) {
                console.error("Receipt: Failed to fetch details", e);
            } finally {
                setLoading(false);
            }
        };

        checkAndFetch();
    }, [state, navigate, user]);

    if (!transaction || loading) return <div className="p-10 text-center fade-in">Loading receipt details...</div>;

    const richData = transaction.data || transaction;
    const source = transaction.data ? { ...transaction.data, ...transaction } : transaction;

    const fmtMoney = (val, currency = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val || 0);
    };

    // Helper for Date (EST)
    const formatDateEST = (isoString) => {
        if (!isoString) return new Date().toLocaleString();
        return new Date(isoString).toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    };

    // Data Mapping
    const beneficiaryName = source.recipient?.name;
    const senderName = source.sender?.name;
    const senderPhone = source.sender?.phoneNumber;

    const totalAmountVal = source.totalAmount?.amount;
    const totalAmountCurr = source.totalAmount?.currency;
    const feeAmount = source.fee?.amount;
    const feeCurrency = source.fee?.currency;

    const orderNumber = source.id || transaction.id;
    const principal = parseFloat(source.totalAmount?.amount || 0);
    const feeVal = parseFloat(source.fee?.amount || 0);
    const grandTotal = (principal + feeVal).toFixed(2);
    const currency = source.totalAmount?.currency || 'USD';

    // Exchange Rate
    const rate = source.destinationExchangeRate?.rate;
    const toCurrency = source.destinationExchangeRate?.toCurrency;
    const exchangeRateStr = rate && toCurrency ? `1 ${currency} = ${rate} ${toCurrency}` : null;

    // Receive Amount
    const receiveVal = source.receivingAmount?.amount;
    const receiveCurr = source.receivingAmount?.currency;

    const contactInfo = source.receipt?.contactInfo;
    const rightToRefund = source.receipt?.rightToRefund;
    const cancellationDisclosure = source.receipt?.cancellationDisclosure;

    return (
        <div className="receipt-page fade-in min-h-screen bg-gray-100 py-10 px-4 flex justify-center items-start">
            <div className="bg-white w-full max-w-3xl shadow-2xl overflow-hidden print-container border-t-8 border-yellow-500">

                {/* Header Section */}
                <div className="p-8 pb-6 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-800 uppercase tracking-tight mb-2">Transaction Receipt</h1>
                        <div className="flex items-center gap-2 text-green-600 font-bold">
                            <span className="text-xl">✓</span>
                            <span>Transaction created. Payment status: {source.payoutStatus || source.status}</span>
                        </div>
                    </div>
                    <div className="text-left md:text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Transmission Order #</p>
                        <p className="text-lg font-mono text-gray-900 font-bold">{orderNumber}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatDateEST(source.createdAt)} (EST)</p>
                    </div>
                </div>

                {/* Main Content Details */}
                <div className="p-8">

                    {/* Financial Summary */}
                    <div className="bg-gray-50 rounded-lg p-6 mb-10 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Financial Summary</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <span className="block text-gray-500 text-xs uppercase mb-1">Total Paid Amount: {fmtMoney(grandTotal, currency)}</span>
                            </div>
                            <div className="md:text-right">
                                <span className="block text-gray-500 text-xs uppercase mb-1">Total Fee: {fmtMoney(feeVal, feeCurrency)}</span>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <span className="block text-gray-500 text-xs uppercase mb-1">Exchange Rate: {exchangeRateStr}</span>
                            </div>
                            <div className="md:text-right">
                                <span className="block text-gray-500 text-xs uppercase mb-1">Receive Amount: {fmtMoney(receiveVal, receiveCurr)}</span>
                            </div>
                        </div>
                    </div>
                    <br />

                    {/* Sender & Beneficiary Details */}
                    <div className="flex flex-col gap-10 mb-10">
                        {/* Sender */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Sender Details</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                <span className="text-gray-500 font-medium">Name: {senderName}</span>
                                <span className="text-gray-900 font-medium">Phone: {senderPhone}</span>
                            </div>
                        </div>


                    </div>
                    <br />
                    {/* Beneficiary */}
                    <div className="flex flex-col gap-10 mb-10">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3 uppercase tracking-wider">Beneficiary Details</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                <span className="text-gray-500 font-medium">Name: {beneficiaryName}</span>
                            </div>
                        </div>
                    </div>

                    <hr className="border-gray-200 mb-8" />

                    {/* Legal Footer */}
                    <div className="text-[11px] text-gray-500 leading-relaxed text-justify space-y-4">
                        {contactInfo && <p>{contactInfo}</p>}
                        {rightToRefund && <p><span className="font-bold">Right to Refund:</span> {rightToRefund}</p>}
                        {cancellationDisclosure && <p><span className="font-bold">Cancellation Disclosure:</span> {cancellationDisclosure}</p>}
                    </div>
                </div>

                {/* Actions */}
                <div className="bg-gray-100 p-6 flex justify-between items-center print:hidden">
                    <button onClick={() => window.print()} className="font-bold text-gray-700 hover:text-black flex items-center gap-2 text-sm">
                        <span>🖨</span> Print Receipt
                    </button>
                    <button onClick={() => navigate('/dashboard')} className="text-white px-6 py-3 rounded hover:opacity-90 transition-all font-bold uppercase tracking-wide text-sm" style={{ background: 'var(--color-success)' }}>
                        New Transfer
                    </button>
                </div>
            </div>

            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-container, .print-container * {
                        visibility: visible;
                    }
                    .print-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        max-width: none;
                        box-shadow: none;
                        border: none;
                    }
                    .print\\:hidden {
                        display: none;
                    }
                }
            `}</style>
        </div >
    );
};

export default Receipt;
