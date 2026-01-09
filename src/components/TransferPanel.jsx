import React, { useContext } from 'react';

// Simple text-based implementation for now, mirroring the layout
const TransferPanel = ({ quote }) => {
    // defaults
    const exchangeRate = quote?.effectiveRate ? `1 USD = ${quote.effectiveRate} ${quote.destinationAmount?.currency || 'PEN'}` : '1 USD';
    const sendingAmount = quote?.sourceAmount?.amount || '0.00';
    const sendingCurrency = quote?.sourceAmount?.currency || 'USD';
    const fee = quote?.fee?.amount || '4.99';
    const feeCurrency = quote?.fee?.currency || 'USD';
    const total = quote?.totalCost?.amount || '0.00';
    const beneficiaryReceives = quote?.destinationAmount?.amount || '0.00';
    const beneficiaryCurrency = quote?.destinationAmount?.currency || 'USD';

    return (
        <div className="transfer-panel">
            <div className="panel-header">
                <span className="icon">⇄</span> TRANSFER PANEL
            </div>

            <div className="panel-section">
                <label>Exchange rate</label>
                <div className="value text-success">{exchangeRate}</div>
            </div>

            <div className="panel-section">
                <label>Transaction summary</label>

                <div className="summary-row">
                    <span className="label">SENDING AMOUNT</span>
                    <span className="value text-success">{sendingAmount} {sendingCurrency}</span>
                </div>
                <div className="summary-row">
                    <span className="label">FEE</span>
                    <span className="value text-success">{fee} {feeCurrency}</span>
                </div>
                <div className="summary-row">
                    <span className="label">YOUR TOTAL</span>
                    <span className="value text-success">{total} {sendingCurrency}</span>
                </div>
                <div className="summary-row">
                    <span className="label">BENEFICIARY RECEIVES</span>
                    <span className="value text-success">{beneficiaryReceives} {beneficiaryCurrency}</span>
                </div>
            </div>

            <style>{`
                .transfer-panel {
                    width: var(--panel-width);
                    background-color: white;
                    border-left: 1px solid #eee;
                    padding: 20px;
                    height: 100vh;
                    position: fixed;
                    right: 0;
                    top: 0;
                    display: flex;
                    flex-direction: column;
                }
                .panel-header {
                    background: #f0f0f0;
                    padding: 10px;
                    font-weight: bold;
                    color: #666;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin: -20px -20px 20px -20px; /* Bleed to edges */
                }
                .panel-section {
                    margin-bottom: 30px;
                }
                .panel-section label {
                    display: block;
                    font-size: 14px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .panel-section .value {
                    font-size: 16px;
                    font-weight: bold;
                }
                .text-success { color: var(--color-success); }
                
                .summary-row {
                    margin-bottom: 15px;
                }
                .summary-row .label {
                    display: block;
                    font-size: 11px;
                    color: #999;
                    text-transform: uppercase;
                }
            `}</style>
        </div>
    );
};

export default TransferPanel;
