import React, { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TransactionContext } from '../context/TransactionContext';

const StepNavigation = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { transactionData } = useContext(TransactionContext);

    const beneficiaryId = transactionData?.beneficiary?.id;

    const steps = [
        { label: 'Amount', path: '/dashboard' },
        { label: 'Beneficiary', paths: ['/beneficiaries', '/beneficiaries/new'] },
        {
            label: 'Delivery Options',
            paths: ['/account'],
            // If we have a beneficiary ID, use the specific route, otherwise if we click it and have no ID, maybe go back to beneficiaries? 
            // For now, let's try to link to the account page if possible, or fallback.
            path: beneficiaryId ? `/beneficiaries/${beneficiaryId}/account` : '/beneficiaries'
        },
        { label: 'Payment Options', path: '/payment' },
        { label: 'Summary', path: '/transaction/review' },
    ];

    const isActive = (step) => {
        if (step.path === location.pathname) return true;
        if (step.paths) {
            return step.paths.some(p => location.pathname.includes(p));
        }
        return false;
    };

    return (
        <div className="step-navigation">
            {steps.map((step, index) => (
                <div
                    key={index}
                    className={`step-item ${isActive(step) ? 'active' : ''}`}
                    onClick={() => navigate(step.path || step.paths?.[0])}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="step-label">{step.label}</div>
                    <div className="step-bar"></div>
                </div>
            ))}

            <style>{`
                .step-navigation {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    border-bottom: 2px solid #f0f0f0;
                    padding-bottom: 0;
                }

                .step-item {
                    flex: 1;
                    text-align: center;
                    padding-bottom: 15px;
                    position: relative;
                    cursor: pointer;
                    color: #aaa;
                    transition: all 0.3s ease;
                }

                .step-item .step-label {
                    font-size: 13px;
                    font-weight: 700;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .step-item .step-bar {
                    height: 4px;
                    background-color: transparent;
                    border-radius: 4px;
                    width: 60%;
                    margin: 0 auto;
                    position: absolute;
                    bottom: -3px; /* Overlap the border */
                    left: 20%;
                    transition: all 0.3s ease;
                }

                .step-item.active {
                    color: var(--color-primary);
                }

                .step-item.active .step-bar {
                    background-color: var(--color-primary);
                    width: 100%;
                    left: 0;
                }

                .step-item:hover {
                    color: var(--color-primary-dark);
                }
            `}</style>
        </div>
    );
};

export default StepNavigation;
