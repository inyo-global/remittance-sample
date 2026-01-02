import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { request } from '../api';
import { TransactionContext } from '../context/TransactionContext';

// Logic:
// 1. Check if user has payment methods.
// 2. View: List (Select) or Add (Tokenizer).
// 3. Selection -> Update Context -> Navigate to Review.
const AddPayment = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { transactionData, setTransactionData } = useContext(TransactionContext);

    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    // Initialize view based on incoming state, default to 'list'
    const [view, setView] = useState(location.state?.forceAdd ? 'add' : 'list');

    // State for the tokenizer instance
    const [tokenizer, setTokenizer] = useState(null);

    // Form inputs state (for validaton/feedback only, mostly handled by tokenizer reading DOM)
    // Actually the tokenizer reads from DOM elements by data-field or ID? 
    // The sample shows `data-field` attributes are important.
    // We'll render standard inputs.

    const fetchMethods = async () => {
        setLoading(true);
        try {
            const res = await request('get', `/payment-methods?userId=${user.id || user.userId}`);
            setMethods(res);

            // Do not auto-switch to 'add'. User wants to see the list/button first.
            // if (res.length === 0 && !location.state?.forceAdd) {
            //    setView('add');
            // }
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
        if (view === 'add') {
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
                                successUrl: window.location.origin + "/3ds/success", // Dummy/Self
                                failUrl: window.location.origin + "/3ds/fail",
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
    }, [view]);

    const handleSuccess = async (resp) => {
        console.log("Tokenizer Success:", resp);
        if (resp.status === '00' && resp.additionalData?.token) {
            // Collect Billing Address
            const billingAddress = {
                address1: document.getElementById('bill-addr1')?.value,
                address2: document.getElementById('bill-addr2')?.value,
                city: document.getElementById('bill-city')?.value,
                state: document.getElementById('bill-state')?.value,
                zipcode: document.getElementById('bill-zip')?.value,
            };

            // Save to backend
            try {
                setLoading(true);

                await request('post', '/payment-methods', {
                    userId: user.id || user.userId,
                    token: resp.additionalData,
                    billingAddress
                });

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
            // Basic validation
            const inputs = document.querySelectorAll('#payment-form-container input[required]');
            let valid = true;
            inputs.forEach(input => {
                if (!input.value) {
                    input.classList.add('border-red-500');
                    valid = false;
                } else {
                    input.classList.remove('border-red-500');
                }
            });

            if (valid) {
                try {
                    tokenizer.tokenizeCard();
                } catch (e) {
                    console.error(e);
                    alert("Tokenizer error: " + e.message);
                }
            } else {
                alert("Please fill all required fields.");
            }
        } else {
            alert("Secure tokenizer not initialized.");
        }
    };

    return (
        <div className="add-payment-page fade-in">
            <div className="header-section mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-secondary text-3xl font-light mb-2">
                        {view === 'add' ? 'Add New Card' : 'Payment Options'}
                    </h1>
                    <p className="text-gray-400">
                        {view === 'add' ? 'Enter your card details safely.' : 'Select how you want to pay.'}
                    </p>
                </div>
                {view === 'list' && (
                    <button
                        onClick={() => setView('add')}
                        className="btn rounded-full px-6 py-2 text-sm font-bold flex items-center gap-2 transition-all hover:shadow-md"
                        style={{ backgroundColor: '#f3f4f6', color: 'var(--color-primary)' }}
                    >
                        <span className="text-xl">+</span> Add New
                    </button>
                )}
            </div>

            {loading ? <div className="loader"></div> : (
                view === 'list' ? (
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
                                        💳
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-700 capitalize">{pm.token?.schemeId || 'Card'}</h3>
                                        <p className="text-sm text-gray-400">
                                            Ending in {pm.token?.lastFourDigits || '****'} • Exp {pm.token?.dtExpiration?.split(' ')[0]}
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
                ) : (
                    <div className="add-form bg-white p-6 rounded shadow-sm border border-gray-100 relative">
                        {/* Wrapper ID for Tokenizer targeting */}
                        <div id="payment-form-container">

                            {/* Billing Address Section */}
                            <h4 className="mb-4 font-bold text-gray-700">Billing Address</h4>

                            <div className="mb-4">
                                <label className="flex items-center gap-2 text-sm text-gray-600 mb-4 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded text-primary focus:ring-primary"
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                // Prepopulate
                                                document.getElementById('bill-addr1').value = user.address || '';
                                                document.getElementById('bill-city').value = user.city || '';
                                                document.getElementById('bill-state').value = user.state || '';
                                                document.getElementById('bill-zip').value = user.zipcode || '';
                                            } else {
                                                // Clear
                                                document.getElementById('bill-addr1').value = '';
                                                document.getElementById('bill-city').value = '';
                                                document.getElementById('bill-state').value = '';
                                                document.getElementById('bill-zip').value = '';
                                            }
                                        }}
                                    />
                                    Use my address on file
                                </label>

                                <div className="mb-3">
                                    <label htmlFor="bill-addr1" className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                                    <input type="text" id="bill-addr1" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="123 Main St" />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="bill-addr2" className="block text-sm font-medium text-gray-700 mb-1">Address Line 2 (Optional)</label>
                                    <input type="text" id="bill-addr2" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="Apt, Suite, etc." />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                                    <div className="md:col-span-1">
                                        <label htmlFor="bill-city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                        <input type="text" id="bill-city" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="New York" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label htmlFor="bill-state" className="block text-sm font-medium text-gray-700 mb-1">State</label>
                                        <select id="bill-state" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary">
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
                                        <input type="text" id="bill-zip" className="form-control w-full p-2 border rounded focus:ring-primary focus:border-primary" placeholder="10001" />
                                    </div>
                                </div>
                            </div>

                            <hr className="my-6 border-gray-100" />

                            {/* Billing Address (Simplified as per sample or just Name) */}
                            {/* Sample has first/last name, email, etc. We'll simplify to Name on Card for speed, unless billing is required. */}
                            {/* Wait, invalid-feedback suggests fields are required. */}

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
                            <button type="button" onClick={() => {
                                if (methods.length > 0) setView('list');
                                else {
                                    const beneficiaryId = transactionData?.beneficiary?.id;
                                    if (beneficiaryId) navigate(`/beneficiaries/${beneficiaryId}/account`);
                                    else navigate('/beneficiaries');
                                }
                            }} className="btn btn-back px-8 py-3 text-lg rounded-full" style={{ background: '#C084FC' }}>
                                Back
                            </button>
                            <button type="button" onClick={handleTokenizeClick} className="btn btn-next px-8 py-3 text-lg rounded-full" style={{ background: 'var(--color-success)', color: 'white' }}>
                                Confirm Payment
                            </button>
                        </div>
                    </div>
                )
            )}
        </div>
    );
};

export default AddPayment;
