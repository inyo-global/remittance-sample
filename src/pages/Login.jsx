import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../components/Input';
import { request } from '../api';

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
        <div className="login-page fade-in" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
            <div className="card w-full max-w-md bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-light text-secondary mb-2">Welcome Back!</h1>
                    <p className="text-gray-400">Please log in to your account.</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
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
                        <div className="bg-red-50 text-red-500 p-3 rounded text-center text-sm mt-4 border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn w-full mt-8 py-3 rounded-full text-lg font-bold transition-transform transform active:scale-95"
                        style={{ background: 'var(--color-success)', color: 'white' }}
                        disabled={loading}
                    >
                        {loading ? 'Logging in...' : 'Log In'}
                    </button>

                    <div className="text-center mt-6">
                        <p className="text-gray-400 text-sm">
                            Don't have an account?{' '}
                            <Link to="/signup" className="text-primary font-bold hover:underline">
                                Sign up
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
