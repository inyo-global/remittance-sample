import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api';

const PaymentMethods = ({ user }) => {
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMethods = async () => {
            try {
                const res = await request('get', `/payment-methods?userId=${user.userId || user.id}`);
                setMethods(res);
            } catch (error) {
                console.error("Error fetching payment methods", error);
            } finally {
                setLoading(false);
            }
        };
        fetchMethods();
    }, [user]);

    if (loading) return <div className="loader"></div>;

    return (
        <div className="container fade-in py-5">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2>My Payment Methods</h2>
                <Link to="/payment" state={{ forceAdd: true }} className="btn btn-primary">Add New Card</Link>
            </div>

            {methods.length === 0 ? (
                <div className="card p-5 text-center text-muted">
                    <p>No payment methods found.</p>
                </div>
            ) : (
                <div className="grid grid-2-cols gap-4">
                    {methods.map(method => (
                        <div key={method.id} className="card p-4">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <h5 className="m-0">{method.type}</h5>
                                <span className="badge badge-success">Verified</span>
                            </div>
                            <div className="text-muted">
                                {method.token.schemeId} **** {method.token.lastFourDigits}
                            </div>
                            <small className="text-muted d-block mt-2">
                                Expires: {method.token.dtExpiration}
                            </small>
                            <div className="mt-3">
                                <span className="text-sm text-gray">Status: {method.data.apiResponse?.status || 'Active'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style jsx>{`
                .grid { display: grid; }
                .grid-2-cols { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
                .gap-4 { gap: 1.5rem; }
                .badge {
                    padding: 0.25em 0.6em;
                    font-size: 75%;
                    font-weight: 700;
                    border-radius: 0.25rem;
                }
                .badge-success { background-color: #28a745; color: white; }
            `}</style>
        </div>
    );
};

export default PaymentMethods;
