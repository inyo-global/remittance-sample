import React, { useContext } from 'react';
import Sidebar from './Sidebar';
import TransferPanel from './TransferPanel';
import StepNavigation from './StepNavigation';
import { useLocation } from 'react-router-dom';
import { TransactionContext } from '../context/TransactionContext';

const MainLayout = ({ children, user, onLogout }) => {
    const location = useLocation();
    const { transactionData } = useContext(TransactionContext);
    const quote = transactionData.quote; // Use context data

    // Define transaction flow routes
    const isTransactionFlow = [
        '/dashboard',
        '/beneficiaries',
        '/payment',
        '/transaction/review'
    ].some(path => location.pathname.startsWith(path));

    const showPanel = isTransactionFlow;
    const showSteps = isTransactionFlow;

    return (
        <div className="main-layout">
            <Sidebar user={user} onLogout={onLogout} />

            <div className={`content-area ${!showPanel ? 'full-width' : ''}`}>
                <div className="top-bar">
                    {/* Items removed as per request */}
                </div>

                {showSteps && <StepNavigation />}

                <div className="page-content">
                    {children}
                </div>
            </div>

            {showPanel && <TransferPanel quote={quote} />}

            <style>{`
                .main-layout {
                    display: flex;
                    width: 100%;
                    min-height: 100vh;
                }
                .content-area {
                    margin-left: var(--sidebar-width);
                    margin-right: var(--panel-width);
                    width: calc(100% - var(--sidebar-width) - var(--panel-width));
                    padding: 40px;
                    display: flex;
                    flex-direction: column;
                    transition: margin-right 0.3s, width 0.3s;
                }
                .content-area.full-width {
                    margin-right: 0;
                    width: calc(100% - var(--sidebar-width));
                }
                .top-bar {
                    display: flex;
                    justify-content: flex-end;
                    gap: 20px;
                    font-size: 12px;
                    font-weight: bold;
                    color: #666;
                    margin-bottom: 20px;
                }
                .log-off {
                    cursor: pointer;
                }
                .page-content {
                    flex: 1;
                    /* max-width for content to match screenshot centering? */
                }
            `}</style>
        </div>
    );
};

export default MainLayout;
