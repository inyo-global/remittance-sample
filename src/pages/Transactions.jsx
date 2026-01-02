import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api';

const Transactions = ({ user }) => {
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.userId) {
            request('get', `/transactions?userId=${user.userId}`)
                .then(data => setTransactions(data))
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [user]);

    const handleRowClick = (txn) => {
        // Navigate to receipt
        // We pass the full transaction object as state, similar to how receipt might expect it
        // Or if receipt expects 'state.transaction'
        navigate('/transaction/receipt', { state: { transaction: txn, fromHistory: true } });
    };

    const fmtMoney = (val, currency) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(val || 0);
    };

    if (loading) return <div className="loader"></div>;

    return (
        <div className="transactions-page fade-in">
            <div className="page-header">
                <h1>Transaction History</h1>
                <p className="subtitle">Track your recent transfers.</p>
            </div>

            <div className="transactions-card">
                {transactions.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">💸</span>
                        <p>No transactions yet.</p>
                        <button className="new-txn-btn" onClick={() => navigate('/dashboard')}>Start Transfer</button>
                    </div>
                ) : (
                    <table className="txn-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Recipient</th>
                                <th>Status</th>
                                <th className="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(txn => (
                                <tr key={txn.id} onClick={() => handleRowClick(txn)} className="txn-row">
                                    <td>
                                        <div className="date-cell">
                                            <span className="date-main">{new Date(txn.createdAt).toLocaleDateString()}</span>
                                            <span className="date-sub">{new Date(txn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="recipient-cell">
                                            <span className="recipient-name">{txn.recipientName}</span>
                                            <span className="recipient-sub">To Bank Account</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${txn.status?.toLowerCase().replace(/_/g, '-') || 'pending'}`}>
                                            {txn.status?.replace(/_/g, ' ') || 'Pending'}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <span className="amount-cell">
                                            {fmtMoney(txn.amount, txn.currency)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <style>{`
                .transactions-page {
                    padding: 20px 0;
                    color: #333;
                }
                .page-header { margin-bottom: 30px; }
                .page-header h1 { font-size: 28px; color: #111; margin-bottom: 5px; }
                .subtitle { color: #666; font-size: 14px; }

                .transactions-card {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
                    border: 1px solid #e5e7eb;
                    overflow: hidden;
                }

                .txn-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .txn-table th {
                    text-align: left;
                    padding: 16px 24px;
                    background: #f9fafb;
                    color: #6b7280;
                    font-size: 11px;
                    text-transform: uppercase;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .txn-table td {
                    padding: 16px 24px;
                    border-bottom: 1px solid #f3f4f6;
                    vertical-align: middle;
                }
                .txn-row {
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .txn-row:hover {
                    background: #f8fafc;
                }
                .txn-row:last-child td {
                    border-bottom: none;
                }

                .date-cell, .recipient-cell {
                    display: flex;
                    flex-direction: column;
                }
                .date-main { font-size: 13px; font-weight: 600; color: #374151; }
                .date-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
                
                .recipient-name { font-size: 14px; font-weight: 600; color: #111; }
                .recipient-sub { font-size: 11px; color: #9ca3af; }

                .amount-cell { font-size: 14px; font-weight: 700; color: #111; }
                
                .text-right { text-align: right; }

                /* Status Badges */
                .status-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .status-badge.completed, .status-badge.paid, .status-badge.payout-succeeded {
                    background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;
                }
                .status-badge.pending, .status-badge.processing, .status-badge.submitted {
                    background: #fffbeb; color: #d97706; border: 1px solid #fde68a;
                }
                .status-badge.failed, .status-badge.declined, .status-badge.rejected {
                    background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;
                }

                .empty-state { padding: 60px; text-align: center; color: #6b7280; }
                .empty-icon { font-size: 40px; display: block; margin-bottom: 15px; opacity: 0.5; }
                .new-txn-btn {
                    margin-top: 20px;
                    background: var(--color-primary);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }
                .new-txn-btn:hover { opacity: 0.9; }

                @media (max-width: 768px) {
                    .txn-table th:nth-child(2), .txn-table td:nth-child(2) {
                        display: none; /* Hide Recipient on mobile? Or just date */
                    }
                }
            `}</style>
        </div>
    );
};
export default Transactions;
