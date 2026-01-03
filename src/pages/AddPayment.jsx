import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

// Logic:
// 1. View: 'list' (Select existing).
// 2. View: 'select-type' (Choose Card vs ACH).
// 3. View: 'add-card' or 'add-ach' (Specific form).
const AddPayment = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { transactionData, setTransactionData } = useContext(TransactionContext);

    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    // Views: 'list', 'select-type', 'add-card', 'add-ach'
    const [view, setView] = useState(location.state?.forceAdd ? 'select-type' : 'list');

    // State for the tokenizer instance
    const [tokenizer, setTokenizer] = useState(null);
    const [challengeUrl, setChallengeUrl] = useState(null);
    const [pendingCardId, setPendingCardId] = useState(null);

    const fetchMethods = async () => {
        setLoading(true);
        try {
            const res = await request('get', `/payment-methods?userId=${user.id || user.userId}`);
            setMethods(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMethods();
    }, [user]);

    const handleSelect = (method) => {
        setTransactionData(prev => ({ ...prev, paymentMethod: method }));
        navigate('/transaction/review');
    };

    // Load Script
    useEffect(() => {
        if (view === 'add-card') {
            const SCRIPT_SRC = "https://cdn.simpleps.com/sandbox/inyo.js";

            const initTokenizer = () => {
                if (window.InyoTokenizer) {
                    console.log("AddPayment: Initializing InyoTokenizer...");
                    try {
                        const t = new window.InyoTokenizer({
                            targetId: '#payment-form-container', // Wrapper ID
                            storeLaterUse: true,
                            publicKey: import.meta.env.VITE_PUBLIC_KEY,
                            threeDSData: {
                                enable: true, // As per sample
                                enablePostMessage: true
                            },
                            successCallback: (resp) => handleSuccess(resp),
                            errorCallback: (resp) => handleError(resp)
                        });
                        setTokenizer(t);
                    } catch (e) {
                        console.error("AddPayment: Tokenizer init failed", e);
                    }
                } else {
                    console.warn("AddPayment: window.InyoTokenizer missing.");
                }
            };

            const loadScript = () => {
                if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
                    initTokenizer();
                    return;
                }
                const script = document.createElement("script");
                script.src = SCRIPT_SRC;
                script.async = true;
                script.onload = initTokenizer;
                document.body.appendChild(script);
            };

            loadScript();
        }
    }, [view]); // Re-init if 3DS requirement changes

    const updateCardStatus = async () => {
        if (!pendingCardId) return;
        try {
            console.log("Updating card status for:", pendingCardId);
            // We call sync to pull latest status from backend/gateway
            const res = await request('get', `/payment-methods/${pendingCardId}/sync`);

            if (res.status === 'Verified' || res.status === 'Active' || res.status === '00' || res.status === 'APPROVED' || res.status === 'AUTHORIZED') {
                setChallengeUrl(null);
                setPendingCardId(null);
                await fetchMethods();
                setView('list');
            } else {
                // If sync didn't find it verified yet, but we got a success 3DS message,
                // we might want to allow it or tell user it's processing.
                // For now, let's assume sync catches it.
                // If not, we might alert? 
                // User said: "backend should leave a comment to verify the card via webhook"
                // This implies we might just close and show list, or show a 'pending' state?
                // Let's close and go to list, assuming webhook acts later if sync failed.
                setChallengeUrl(null);
                setPendingCardId(null);
                await fetchMethods();
                setView('list');
                alert("Card verified! Status is updating.");
            }
        } catch (e) {
            console.error("Update status error", e);
            alert("Error updating card status: " + e.message);
        }
    };

    // Handle 3DS Message
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data && event.data.response && (event.data.response.paymentId || event.data.response.id)) {
                const response = event.data.response;
                console.log("AddPayment: 3DS Response received", response);

                if (response.status == 'AUTHORIZED' && response.cvcResult == 'APPROVED' && response.avsResult == 'APPROVED') {
                    console.log("3DS Challenge Approved for pending card, syncing...");
                    updateCardStatus();
                }
                else {
                    console.warn("3DS Verification Failed:", response);
                    alert("Card verification failed or was declined. Please check details and try again.");
                    setChallengeUrl(null); // Redirect back to form
                    setPendingCardId(null); // Keep ID? No, effectively reset.
                    // view is still 'add-card', so form appears.
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [pendingCardId, updateCardStatus]);


    const handleSuccess = async (resp) => {
        console.log("Tokenizer Success:", resp);
        if (resp.status === '00' && resp.additionalData?.token) {
            // Collect Billing Address
            const billingAddress = getBillingAddress();

            // Save to backend
            try {
                setLoading(true);

                const res = await request('post', '/payment-methods/cards', {
                    userId: user.id || user.userId,
                    token: resp.additionalData,
                    billingAddress
                });

                if (res.status === 'ActionRequired' && res.redirectAcsUrl) {
                    setChallengeUrl(res.redirectAcsUrl);
                    setPendingCardId(res.id);
                    return;
                }

                // Refresh and switch view
                await fetchMethods();
                setView('list');
            } catch (err) {
                alert('Error saving card: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        else {
            alert('Tokenizer processed but status unknown: ' + JSON.stringify(resp));
        }
    };

    const handleACHSubmit = async () => {
        // Collect ACH Data
        const bankData = {
            routingNumber: document.getElementById('ach-routing').value,
            accountNumber: document.getElementById('ach-account').value,
            accountType: document.getElementById('ach-type').value,
            nickname: document.getElementById('ach-nickname').value
        };

        if (!bankData.routingNumber || !bankData.accountNumber || !bankData.accountType) {
            alert("Please fill all required ACH fields.");
            return;
        }

        try {
            setLoading(true);
            await request('post', '/payment-methods/ach', {
                userId: user.id || user.userId,
                bankData
            });
            await fetchMethods();
            setView('list');
        } catch (err) {
            alert('Error saving bank account: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getBillingAddress = () => ({
        address1: document.getElementById('bill-addr1')?.value,
        address2: document.getElementById('bill-addr2')?.value,
        city: document.getElementById('bill-city')?.value,
        state: document.getElementById('bill-state')?.value,
        zipcode: document.getElementById('bill-zip')?.value,
    });

    const handleError = (resp) => {
        console.error("Tokenizer Error:", resp);
        // Highlight fields
        // Clear previous
        document.querySelectorAll('.form-control').forEach(el => el.classList.remove('border-red-500'));

        if (resp.code === 'INVALID_PAN') document.querySelector('#cc-number')?.classList.add('border-red-500');
        if (resp.code === 'INVALID_EXPIRY_DATE') document.querySelector('#cc-expiration')?.classList.add('border-red-500');
        if (resp.code === 'INVALID_CVV') document.querySelector('#cc-cvv')?.classList.add('border-red-500');

        alert('Payment Error: ' + (resp.message || resp.code));
    };

    const handleTokenizeClick = () => {
        if (tokenizer) {
            // Check billing fields manually first since they are outside tokenizer status
            const inputs = document.querySelectorAll('.billing-section input[required], .billing-section select[required]');
            let valid = true;
            inputs.forEach(input => {
                if (!input.value) {
                    input.classList.add('border-red-500');
                    valid = false;
                } else {
                    input.classList.remove('border-red-500');
                }
            });

            if (!valid) {
                alert("Please complete billing address.");
                return;
            }

            try {
                tokenizer.tokenizeCard();
            } catch (e) {
                console.error(e);
                alert("Tokenizer error: " + e.message);
            }
        } else {
            alert("Secure tokenizer not initialized.");
        }
    };

    const toggleBilling = (e) => {
        if (e.target.checked) {
            document.getElementById('bill-addr1').value = user.address || '';
            document.getElementById('bill-city').value = user.city || '';
            document.getElementById('bill-state').value = user.state || '';
            document.getElementById('bill-zip').value = user.zipcode || '';
        } else {
            document.getElementById('bill-addr1').value = '';
            document.getElementById('bill-city').value = '';
            document.getElementById('bill-state').value = '';
            document.getElementById('bill-zip').value = '';
        }
    };

    // Shared Billing Fragment
    const BillingSection = () => (
        <div className="billing-section">
            <h4 className="mb-4 font-bold text-gray-700">Billing Address</h4>
            <div className="mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 mb-4 cursor-pointer">
                    <input
                        type="checkbox"
                        className="rounded text-primary focus:ring-primary"
                        onChange={toggleBilling}
                    />
                    Use my address on file
                </label>

                <div className="mb-3">
                    <label htmlFor="bill-addr1" className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                    <input type="text" id="bill-addr1" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="123 Main St" required />
                </div>
                <div className="mb-3">
                    <label htmlFor="bill-addr2" className="block text-sm font-medium text-gray-700 mb-1">Address Line 2 (Optional)</label>
                    <input type="text" id="bill-addr2" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="Apt, Suite, etc." />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                    <div className="md:col-span-1">
                        <label htmlFor="bill-city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input type="text" id="bill-city" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="New York" required />
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="bill-state" className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <select id="bill-state" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" required>
                            <option value="">Select State</option>
                            <option value="AL">Alabama</option>
                            <option value="AK">Alaska</option>
                            <option value="AZ">Arizona</option>
                            <option value="AR">Arkansas</option>
                            <option value="CA">California</option>
                            <option value="CO">Colorado</option>
                            <option value="CT">Connecticut</option>
                            <option value="DE">Delaware</option>
                            <option value="DC">District Of Columbia</option>
                            <option value="FL">Florida</option>
                            <option value="GA">Georgia</option>
                            <option value="HI">Hawaii</option>
                            <option value="ID">Idaho</option>
                            <option value="IL">Illinois</option>
                            <option value="IN">Indiana</option>
                            <option value="IA">Iowa</option>
                            <option value="KS">Kansas</option>
                            <option value="KY">Kentucky</option>
                            <option value="LA">Louisiana</option>
                            <option value="ME">Maine</option>
                            <option value="MD">Maryland</option>
                            <option value="MA">Massachusetts</option>
                            <option value="MI">Michigan</option>
                            <option value="MN">Minnesota</option>
                            <option value="MS">Mississippi</option>
                            <option value="MO">Missouri</option>
                            <option value="MT">Montana</option>
                            <option value="NE">Nebraska</option>
                            <option value="NV">Nevada</option>
                            <option value="NH">New Hampshire</option>
                            <option value="NJ">New Jersey</option>
                            <option value="NM">New Mexico</option>
                            <option value="NY">New York</option>
                            <option value="NC">North Carolina</option>
                            <option value="ND">North Dakota</option>
                            <option value="OH">Ohio</option>
                            <option value="OK">Oklahoma</option>
                            <option value="OR">Oregon</option>
                            <option value="PA">Pennsylvania</option>
                            <option value="RI">Rhode Island</option>
                            <option value="SC">South Carolina</option>
                            <option value="SD">South Dakota</option>
                            <option value="TN">Tennessee</option>
                            <option value="TX">Texas</option>
                            <option value="UT">Utah</option>
                            <option value="VT">Vermont</option>
                            <option value="VA">Virginia</option>
                            <option value="WA">Washington</option>
                            <option value="WV">West Virginia</option>
                            <option value="WI">Wisconsin</option>
                            <option value="WY">Wyoming</option>
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="bill-zip" className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                        <input type="text" id="bill-zip" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="10001" required />
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="add-payment-page fade-in">
            {!challengeUrl && (
                <div className="header-section mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-secondary text-3xl font-light mb-2">
                            {view === 'list' && 'Payment Options'}
                            {view === 'select-type' && 'Add Payment Method'}
                            {view === 'add-card' && 'Add New Card'}
                            {view === 'add-ach' && 'Add Bank Account'}
                        </h1>
                        <p className="text-gray-400">
                            {view === 'list' && 'Select how you want to pay.'}
                            {view === 'select-type' && 'Choose a payment method type.'}
                            {view === 'add-card' && 'Enter your card details safely.'}
                            {view === 'add-ach' && 'Link your bank account via ACH.'}
                        </p>
                    </div>
                    {view === 'list' && (
                        <button
                            onClick={() => setView('select-type')}
                            className="btn rounded-full px-6 py-2 text-sm font-bold flex items-center gap-2 transition-all hover:shadow-md"
                            style={{ backgroundColor: '#f3f4f6', color: 'var(--color-primary)' }}
                        >
                            <span className="text-xl">+</span> Add New
                        </button>
                    )}
                </div>
            )}

            {challengeUrl ? (
                <div className="w-full h-[800px] bg-white rounded shadow-sm border border-gray-100 relative mt-6">
                    <button
                        onClick={() => {
                            setChallengeUrl(null);
                            setPendingCardId(null);
                            fetchMethods();
                        }}
                        className="absolute top-2 right-2 text-gray-500 hover:text-black text-2xl font-bold z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm border border-gray-200"
                        title="Close and Refresh"
                    >
                        &times;
                    </button>
                    <iframe
                        src={challengeUrl}
                        className="w-full h-full rounded"
                        title="Verification"
                        style={{ border: 'none' }}
                    />
                </div>
            ) : (
                loading ? <div className="loader"></div> : (
                    <>
                        {/* VIEW: LIST */}
                        {view === 'list' && (
                            <div className="methods-list space-y-4">
                                {methods.length === 0 && (
                                    <div className="text-center p-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                                        No payment methods found. Add one to continue.
                                    </div>
                                )}

                                {methods.map(pm => (
                                    <div
                                        key={pm.id}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            console.log('Selecting payment method:', pm);
                                            handleSelect(pm);
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                handleSelect(pm);
                                            }
                                        }}
                                        className="bg-white p-4 rounded border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all flex justify-between items-center"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-2xl">
                                                {pm.type === 'ACH' ? '🏦' : '💳'}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-700 capitalize">
                                                    {pm.type === 'ACH' ? (pm.nickname || 'Bank Account') : (pm.token?.schemeId || 'Card')}
                                                </h3>
                                                <p className="text-sm text-gray-400">
                                                    {pm.type === 'ACH' ?
                                                        `Ending in ****${pm.token.accountNumber.slice(-4)}` :
                                                        `Ending in ${pm.token?.lastFourDigits || '****'}`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-primary font-bold">Select ›</span>
                                    </div>
                                ))}

                                <div className="flex justify-start" style={{ marginTop: '3rem' }}>
                                    <button type="button" onClick={() => {
                                        const beneficiaryId = transactionData?.beneficiary?.id;
                                        if (beneficiaryId) navigate(`/beneficiaries/${beneficiaryId}/account`);
                                        else navigate('/beneficiaries');
                                    }} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VIEW: SELECT TYPE */}
                        {view === 'select-type' && (
                            <div className="select-type-view grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div
                                    onClick={() => setView('add-card')}
                                    className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition-all text-center group"
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">💳</div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">Debit Card</h3>
                                    <p className="text-gray-500">Instant processing. Standard fees apply.</p>
                                </div>

                                <div
                                    onClick={() => setView('add-ach')}
                                    className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-lg cursor-pointer transition-all text-center group"
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🏦</div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">Bank Account (ACH)</h3>
                                    <p className="text-gray-500">Lower fees. Takes 1-3 business days.</p>
                                </div>

                                <div className="col-span-full mt-4">
                                    <button type="button" onClick={() => {
                                        if (methods.length > 0) setView('list');
                                        else navigate(-1);
                                    }} className="btn btn-back text-gray-500 hover:text-gray-800">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VIEW: ADD CARD */}
                        {view === 'add-card' && (
                            <div className="add-form bg-white p-6 rounded shadow-sm border border-gray-100 relative">
                                <BillingSection />
                                <hr className="my-6 border-gray-100" />

                                <div id="payment-form-container">
                                    <h4 className="mb-4 font-bold text-gray-700">Card Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label htmlFor="cc-name" className="block text-sm font-medium text-gray-700 mb-1">Name on card</label>
                                            <input type="text" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                data-field="cardholder" id="cc-name" placeholder="John Doe" required />
                                        </div>
                                        <div>
                                            <label htmlFor="cc-number" className="block text-sm font-medium text-gray-700 mb-1">Debit card number</label>
                                            <input type="text" pattern="[0-9]{4}[0-9]{4}[0-9]{4}[0-9]{4}"
                                                className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                data-field="pan" id="cc-number" placeholder="0000 0000 0000 0000" maxLength="19" required />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div>
                                            <label htmlFor="cc-expiration" className="block text-sm font-medium text-gray-700 mb-1">Expiration</label>
                                            <input type="text" pattern="[0-9]{2}/[0-9]{2}"
                                                className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                data-field="expirationDate" id="cc-expiration" placeholder="MM/YY" maxLength="5" required />
                                        </div>
                                        <div>
                                            <label htmlFor="cc-cvv" className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                                            <input type="text" pattern="[0-9]{3,4}"
                                                className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                data-field="securitycode" id="cc-cvv" placeholder="123" maxLength="4" required />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-between" style={{ marginTop: '3rem' }}>
                                    <button type="button" onClick={() => setView('select-type')} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                                        Back
                                    </button>
                                    <button type="button" onClick={handleTokenizeClick} className="btn btn-next px-8 py-3 text-lg rounded-full" style={{ background: 'var(--color-success)', color: 'white' }}>
                                        Add Card
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* VIEW: ADD ACH */}
                        {view === 'add-ach' && (
                            <div className="add-form bg-white p-6 rounded shadow-sm border border-gray-100 relative">
                                {/* Billing Section removed for ACH as per request */}

                                <div id="ach-form-container">
                                    <h4 className="mb-4 font-bold text-gray-700">Bank Account Details (ACH)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label htmlFor="ach-routing" className="block text-sm font-medium text-gray-700 mb-1">Routing Number</label>
                                            <input type="text" id="ach-routing" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                placeholder="9 Digits" maxLength="9" required />
                                        </div>
                                        <div>
                                            <label htmlFor="ach-account" className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                                            <input type="text" id="ach-account" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                placeholder="Account Number" required />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label htmlFor="ach-type" className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                                            <select id="ach-type" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" required>
                                                <option value="CHECKING">Checking</option>
                                                <option value="SAVINGS">Savings</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="ach-nickname" className="block text-sm font-medium text-gray-700 mb-1">Account Nickname (Optional)</label>
                                            <input type="text" id="ach-nickname" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary"
                                                placeholder="e.g. Joint Checking" />
                                        </div>

                                    </div>
                                </div>

                                <div className="flex justify-between" style={{ marginTop: '3rem' }}>
                                    <button type="button" onClick={() => setView('select-type')} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                                        Back
                                    </button>
                                    <button type="button" onClick={handleACHSubmit} className="btn btn-next px-8 py-3 text-lg rounded-full" style={{ background: 'var(--color-success)', color: 'white' }}>
                                        Add Account
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )
            )}
        </div>
    );
};

export default AddPayment;
