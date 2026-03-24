import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../components/Input';
import { request } from '../api';
import logo from '../assets/inyo-logo.png';

const Login = ({ onLogin }) => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await request('post', '/login', formData);
            // Backend now returns { user: {...}, token: '...' }
            // or if legacy just {...userInfo}

            let userData = res.user || res;
            // Normalize ID: The backend user object uses 'id'. The frontend sometimes expects 'userId'.
            if (userData.id && !userData.userId) {
                userData.userId = userData.id;
            }
            
            if (res.token) {
                // Store token in localStorage for persistence if implementing full auth
                localStorage.setItem('authToken', res.token);
            }
            
            onLogin(userData);
        } catch (err) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in" style={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
            <div style={{ width: '100%', maxWidth: 400, padding: '2rem' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ marginBottom: '1.5rem'}}>
                        <img src={logo} alt="Inyo" style={{ height: 48 }} />
                        <p  style={{ margin: '0.45rem 0 0', fontSize: '0.75rem', fontWeight: 400, color: '#b0b0b0', letterSpacing: '0.12em', textTransform: 'uppercase' }}>REMITTANCE SAMPLE</p>
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1A1A2E', marginBottom: '0.4rem' }}>Welcome Back</h1>
                    <p style={{ color: '#9ca3af', fontSize: '0.95rem' }}>Log in to your account to continue.</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Input
                            name="email"
                            label="Email Address"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            placeholder="you@example.com"
                        />
                        <Input
                            name="password"
                            label="Password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.875rem', textAlign: 'center', marginTop: '1rem' }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            display: 'block',
                            width: '100%',
                            marginTop: '1.75rem',
                            padding: '0.85rem',
                            background: loading ? '#d1fae5' : 'var(--color-success)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 50,
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        {loading ? 'Logging in…' : 'Log In'}
                    </button>

                    <p style={{ textAlign: 'center', marginTop: '1.25rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                        Don't have an account?{' '}
                        <Link to="/signup" style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}>
                            Sign up
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default Login;
