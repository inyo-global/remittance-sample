import React, { useState, useEffect } from 'react';
import { request } from '../api';

const Compliance = ({ user }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Fetch compliance data
        request('get', `/compliance?userId=${user.id || user.userId}`)
            .then(res => setData(res))
            .catch(err => {
                console.error(err);
                setError(err.message || 'Failed to load compliance data');
            })
            .finally(() => setLoading(false));
    }, [user]);

    if (loading) return <div className="loader"></div>;
    if (error) return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;
    if (!data || !data.currentComplianceLevel) return <div style={{ padding: '20px' }}>No compliance data found.</div>;

    const { currentComplianceLevel, nextComplianceLevel, missingFieldsForNextComplianceLevel } = data;

    const fmtMoney = (val, currency = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val || 0);
    };

    return (
        <div className="compliance-page fade-in">
            <div className="page-header">
                <h1>Compliance & Limits</h1>
                <p className="subtitle">View your current transaction limits and upgrade requirements.</p>
            </div>

            {/* Current Level Card */}
            <div className="compliance-card primary-card">
                <div className="card-header">
                    <span className="card-label">CURRENT STATUS</span>
                    <div className="level-badge active">
                        <span className="level-name">{currentComplianceLevel.level.replace('_', ' ')}</span>
                        <span className="status-indicator">ACTIVE</span>
                    </div>
                </div>

                <div className="limits-section">
                    <h3 className="section-title">Transaction Limits</h3>
                    <div className="limits-grid">
                        <div className="limit-box">
                            <label>24 Hours</label>
                            <span className="amount">{fmtMoney(currentComplianceLevel.limits.oneDayLimit.amount, currentComplianceLevel.limits.oneDayLimit.currency)}</span>
                        </div>
                        <div className="limit-box">
                            <label>30 Days</label>
                            <span className="amount">{fmtMoney(currentComplianceLevel.limits.thirtyDaysLimit.amount, currentComplianceLevel.limits.thirtyDaysLimit.currency)}</span>
                        </div>
                        <div className="limit-box">
                            <label>180 Days</label>
                            <span className="amount">{fmtMoney(currentComplianceLevel.limits.oneHundredAndEightyDaysLimit.amount, currentComplianceLevel.limits.oneHundredAndEightyDaysLimit.currency)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Next Level Card */}
            {nextComplianceLevel && (
                <div className="compliance-card secondary-card">
                    <div className="card-header">
                        <span className="card-label">NEXT LEVEL</span>
                        <div className="level-badge upcoming">
                            <span className="level-name">{nextComplianceLevel.level.replace('_', ' ')}</span>
                            <span className="status-indicator">UPGRADE AVAILABLE</span>
                        </div>
                    </div>

                    <div className="upgrade-grid">
                        <div className="limits-section">
                            <h3 className="section-title">New Limits</h3>
                            <ul className="limits-list">
                                <li>
                                    <span>24 Hours</span>
                                    <span className="highlight">{fmtMoney(nextComplianceLevel.limits.oneDayLimit.amount, nextComplianceLevel.limits.oneDayLimit.currency)}</span>
                                </li>
                                <li>
                                    <span>30 Days</span>
                                    <span className="highlight">{fmtMoney(nextComplianceLevel.limits.thirtyDaysLimit.amount, nextComplianceLevel.limits.thirtyDaysLimit.currency)}</span>
                                </li>
                                <li>
                                    <span>180 Days</span>
                                    <span className="highlight">{fmtMoney(nextComplianceLevel.limits.oneHundredAndEightyDaysLimit.amount, nextComplianceLevel.limits.oneHundredAndEightyDaysLimit.currency)}</span>
                                </li>
                            </ul>
                        </div>

                        <div className="requirements-section">
                            <h3 className="section-title">Requirements</h3>
                            {missingFieldsForNextComplianceLevel && missingFieldsForNextComplianceLevel.length > 0 ? (
                                <div className="requirements-box">
                                    <p>Please provide:</p>
                                    <ul>
                                        {missingFieldsForNextComplianceLevel.map(field => (
                                            <li key={field}>{field.replace(/([A-Z])/g, ' $1').trim()}</li>
                                        ))}
                                    </ul>
                                    <button className="upgrade-btn" onClick={() => alert('Feature coming soon!')}>Complete Profile</button>
                                </div>
                            ) : (
                                <div className="eligible-box">
                                    <p>You are eligible!</p>
                                    <small>Contact support to upgrade.</small>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .compliance-page {
                    padding: 20px 0;
                    color: #333;
                }
                .page-header {
                    margin-bottom: 30px;
                }
                .page-header h1 {
                    font-size: 28px;
                    color: #111;
                    margin-bottom: 5px;
                }
                .subtitle {
                    color: #666;
                    font-size: 14px;
                }

                /* Cards - LIGHT THEME */
                .compliance-card {
                    background: white;
                    color: #333;
                    border-radius: 12px;
                    padding: 25px;
                    margin-bottom: 30px;
                    border: 1px solid #e5e7eb;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
                    position: relative;
                    overflow: hidden;
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 25px;
                    border-bottom: 1px solid #f3f4f6;
                    padding-bottom: 15px;
                    position: relative;
                    z-index: 1;
                }

                .card-label {
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: #9ca3af; /* Light Gray */
                    text-transform: uppercase;
                }

                .level-badge {
                    text-align: right;
                }
                .level-name {
                    display: block;
                    font-size: 24px;
                    font-weight: 700;
                    line-height: 1.2;
                    color: #111;
                }
                .status-indicator {
                    display: inline-block;
                    font-size: 9px;
                    font-weight: 700;
                    background: rgba(0, 230, 118, 0.1); 
                    color: #059669; /* Darker Green for visibility on white */
                    padding: 2px 8px;
                    border-radius: 4px;
                    margin-top: 5px;
                    letter-spacing: 0.5px;
                }
                .level-badge.upcoming .status-indicator {
                    background: rgba(160, 51, 255, 0.1); 
                    color: var(--color-primary);
                }

                .section-title {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #9ca3af;
                    margin-bottom: 15px;
                    font-weight: 600;
                }

                /* Limits Grid */
                .limits-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                }
                .limit-box {
                    background: #f9fafb; /* Very light gray */
                    padding: 15px;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                }
                .limit-box label {
                    display: block;
                    font-size: 10px;
                    text-transform: uppercase;
                    color: #6b7280;
                    margin-bottom: 5px;
                }
                .limit-box .amount {
                    font-size: 18px;
                    font-weight: 700;
                    color: #111;
                    display: block;
                }

                /* Upgrade Section (Next Level) */
                .upgrade-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                    position: relative;
                    z-index: 1;
                }
                
                .limits-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .limits-list li {
                    display: flex;
                    justify-content: space-between;
                    padding: 10px 0;
                    border-bottom: 1px solid #f3f4f6;
                    font-size: 13px;
                }
                .limits-list li:last-child {
                    border-bottom: none;
                }
                .limits-list span:first-child {
                    color: #6b7280;
                }
                .limits-list .highlight {
                    font-weight: 700;
                    color: var(--color-primary); /* Purple */
                }

                .requirements-box {
                    background: #fffbeb; /* Amber-50 */
                    border: 1px solid #fcd34d; /* Amber-300 */
                    padding: 20px;
                    border-radius: 8px;
                }
                .requirements-box p {
                    margin: 0 0 10px 0;
                    font-size: 13px;
                    font-weight: 600;
                    color: #92400e; /* Amber-800 */
                }
                .requirements-box ul {
                    padding-left: 20px;
                    margin-bottom: 15px;
                }
                .requirements-box li {
                    font-size: 13px;
                    color: #b45309; /* Amber-700 */
                    margin-bottom: 5px;
                    text-transform: capitalize;
                }
                
                .upgrade-btn {
                    width: 100%;
                    background: #f59e0b; /* Amber-500 */
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 6px;
                    font-weight: 700;
                    cursor: pointer;
                    font-size: 12px;
                    text-transform: uppercase;
                    transition: background 0.2s;
                }
                .upgrade-btn:hover {
                    background: #d97706; /* Amber-600 */
                }

                .eligible-box {
                    background: #ecfdf5; /* Emerald-50 */
                    border: 1px solid #6ee7b7;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                }
                .eligible-box p {
                    color: #059669;
                    font-weight: 700;
                    font-size: 16px;
                    margin-bottom: 5px;
                }
                .eligible-box small {
                    color: #047857;
                }

                @media (max-width: 768px) {
                    .limits-grid {
                        grid-template-columns: 1fr;
                    }
                    .upgrade-grid {
                        grid-template-columns: 1fr;
                        gap: 20px;
                    }
                }
            `}</style>
        </div>
    );
};

export default Compliance;
