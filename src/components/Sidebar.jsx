import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { request } from '../api';

const Sidebar = ({ user, onLogout }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [limits, setLimits] = useState(null);
    const [isLimitsOpen, setIsLimitsOpen] = useState(false);

    const isActive = (path) => location.pathname === path;

    useEffect(() => {
        const fetchLimits = async () => {
            if (!user?.userId) return;
            try {
                const data = await request('get', `/limits?userId=${user.userId}`);
                setLimits(data);
            } catch (error) {
                console.error("Failed to fetch limits", error);
            }
        };
        fetchLimits();
    }, [user]);

    // Helper to format limit text
    const renderLimit = (label, data) => {
        if (!data) return null;

        const limitVal = data.limit?.amount || data.limit || 0;
        const usedVal = data.used?.amount || data.used || 0;
        const currency = data.limit?.currency || 'USD';

        const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
        const percentage = parseFloat(limitVal) > 0 ? (parseFloat(usedVal) / parseFloat(limitVal)) * 100 : 0;

        return (
            <div className="limit-item">
                <label className="limit-label">{label}</label>
                <div className="limit-values">
                    <span className="val-used">Used: {fmt(usedVal)}</span>
                    <span className="val-limit">Limit: {fmt(limitVal)}</span>
                </div>
                <div className="limit-bar-bg">
                    <div className="limit-bar-fill" style={{ width: `${Math.min(percentage, 100)}%` }}></div>
                </div>
            </div>
        );
    };

    return (
        <div className="sidebar">
            <div className="logo-area">
                <h1 className="logo-text">inyo<sup style={{ fontSize: '0.5em' }}>®</sup></h1>
            </div>

            <div className="user-greeting">
                <h2>Welcome,<br />{user?.firstName || 'User'}</h2>
            </div>

            {/* Limits Widget - Collapsible */}
            <div className="amount-widget">
                <button
                    onClick={() => setIsLimitsOpen(!isLimitsOpen)}
                    className="widget-toggle"
                >
                    <span>Compliance Limits (USD)</span>
                    <span className="toggle-icon">{isLimitsOpen ? '−' : '+'}</span>
                </button>

                {isLimitsOpen && (
                    <div className="widget-content fade-in">
                        {limits ? (
                            <>
                                {renderLimit('24 Hours', limits.oneDayLimit)}
                                {renderLimit('30 Days', limits.thirtyDaysLimit)}
                                {renderLimit('180 Days', limits.oneHundredAndEightyDaysLimit)}
                            </>
                        ) : (
                            <div className="loading-text">Loading...</div>
                        )}
                    </div>
                )}
            </div>

            <nav className="nav-links">
                <div className="nav-section">
                    <h3>MY TRANSACTIONS</h3>
                    <ul>
                        <li className={isActive('/dashboard') ? 'active' : ''} onClick={() => navigate('/dashboard')}>New Transaction</li>
                        <li className={isActive('/transactions') ? 'active' : ''} onClick={() => navigate('/transactions')}>Transaction Tracking</li>
                    </ul>
                </div>

                <div className="nav-section">
                    <h3>MY PROFILE</h3>
                    <ul>
                        <li className={isActive('/profile') ? 'active' : ''} onClick={() => navigate('/profile')}>Personal information</li>
                        <li className={isActive('/compliance') ? 'active' : ''} onClick={() => navigate('/compliance')}>Compliance Level</li>
                        <li className={isActive('/beneficiaries') ? 'active' : ''} onClick={() => navigate('/beneficiaries')}>Beneficiaries</li>
                    </ul>
                </div>

                <div className="nav-section">
                    <h3>MY ACCOUNT</h3>
                    <ul>
                        <li>Change password</li>
                        <li onClick={onLogout} style={{ cursor: 'pointer' }}>Log Off</li>
                    </ul>
                </div>
            </nav>

            <style>{`
                .sidebar {
                    width: var(--sidebar-width);
                    background-color: var(--color-sidebar-bg);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    padding: 20px;
                    height: 100vh;
                    position: fixed;
                    left: 0;
                    top: 0;
                    overflow-y: auto;
                }
                .logo-area {
                    margin-bottom: 30px;
                }
                .logo-text {
                    color: white;
                    font-size: 24px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                }
                .user-greeting {
                    margin-bottom: 20px;
                }
                .user-greeting h2 {
                    font-weight: 300;
                    margin: 0;
                    color: white;
                    font-size: 16px;
                }
                
                /* Widget Styles */
                .amount-widget {
                    margin-bottom: 24px;
                    border-bottom: 1px solid #374151; /* gray-700 approx */
                    padding-bottom: 8px;
                }
                .widget-toggle {
                    width: 100%;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    font-weight: bold;
                    color: #9ca3af; /* gray-400 */
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    background: none;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    transition: color 0.2s;
                }
                .widget-toggle:hover {
                    color: white;
                }
                .toggle-icon {
                    font-size: 18px;
                    line-height: 1;
                }
                .widget-content {
                    padding-top: 4px;
                    padding-bottom: 8px;
                }
                .loading-text {
                    font-size: 10px;
                    color: #4b5563; /* gray-600 */
                }

                /* Limit Item Styles */
                .limit-item {
                    margin-bottom: 12px;
                }
                .limit-item:last-child {
                    margin-bottom: 0;
                }
                .limit-label {
                    font-size: 9px;
                    color: #6b7280; /* gray-500 */
                    display: block;
                    margin-bottom: 2px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .limit-values {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                    font-weight: bold;
                }
                .val-used {
                    color: #d1d5db; /* gray-300 */
                }
                .val-limit {
                    color: #6b7280; /* gray-500 */
                }
                .limit-bar-bg {
                    width: 100%;
                    background-color: #1f2937; /* gray-800 */
                    height: 2px;
                    margin-top: 2px;
                    border-radius: 2px;
                    overflow: hidden;
                }
                .limit-bar-fill {
                    background-color: #22c55e; /* green-500 */
                    height: 100%;
                }

                /* Nav Styles */
                .nav-section {
                    margin-bottom: 30px;
                }
                .nav-section h3 {
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 10px;
                    text-transform: uppercase;
                }
                .nav-section ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .nav-section li {
                    padding: 8px 0;
                    cursor: pointer;
                    color: #ddd;
                    font-size: 14px;
                    border-left: 3px solid transparent;
                    padding-left: 10px;
                    transition: all 0.2s;
                }
                .nav-section li:hover, .nav-section li.active {
                    color: white;
                    border-left-color: var(--color-primary);
                    background: rgba(255,255,255,0.05);
                }
                .nav-section li.active {
                    background: linear-gradient(90deg, rgba(160,51,255,0.2) 0%, rgba(160,51,255,0) 100%);
                }
            `}</style>
        </div>
    );
};

export default Sidebar;
