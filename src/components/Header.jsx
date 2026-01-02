import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const Header = ({ user, onLogout }) => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <nav className="navbar">
            <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/dashboard" className="logo">
                    Inyo Demo
                </Link>

                {user && (
                    <div className="nav-links" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <Link
                            to="/dashboard"
                            className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
                        >
                            New Transaction
                        </Link>
                        <Link
                            to="/transactions"
                            className={`nav-link ${location.pathname === '/transactions' ? 'active' : ''}`}
                        >
                            My Transactions
                        </Link>
                        <Link
                            to="/payment-methods"
                            className={`nav-link ${location.pathname === '/payment-methods' ? 'active' : ''}`}
                        >
                            Payment Methods
                        </Link>
                        <Link
                            to="/profile"
                            className={`nav-link ${location.pathname === '/profile' ? 'active' : ''}`}
                        >
                            My Profile
                        </Link>

                        <span className="text-muted">Hello, {user.firstName || 'User'}</span>
                    </div>
                )}
            </div>

            <style>{`
                .navbar {
                    position: sticky;
                    top: 0;
                    z-index: 1000;
                    backdrop-filter: blur(10px);
                    background: rgba(255, 255, 255, 0.9);
                    border-bottom: 1px solid #eaeaea;
                    padding: 1rem 0;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                .logo {
                    font-weight: 800;
                    font-size: 1.5rem;
                    text-decoration: none;
                    background: var(--brand-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .nav-link {
                    text-decoration: none;
                    color: #555;
                    font-weight: 500;
                    transition: color 0.2s;
                    font-size: 0.95rem;
                }
                .nav-link:hover, .nav-link.active {
                    color: var(--primary-color);
                    font-weight: 600;
                }
                .btn-sm {
                    padding: 0.4rem 0.8rem;
                    font-size: 0.85rem;
                }
            `}</style>
        </nav >
    );
};

export default Header;
