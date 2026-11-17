import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { request } from '../api';
import { errorMessage } from '../lib/format';
import type { AuthResponse, User } from '../types';

export interface LoginProps {
    onLogin: (user: User) => void | Promise<void>;
}

const Login = ({ onLogin }: LoginProps) => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await request<AuthResponse>('post', '/login', formData);
            const userData: User = { ...res.user };
            if (userData.id && !userData.userId) userData.userId = userData.id;
            if (res.token) localStorage.setItem('authToken', res.token);
            await onLogin(userData);
        } catch (err) {
            setError(errorMessage(err, 'Login failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Welcome back"
            subtitle="Log in to continue to your account."
            footer={
                <>
                    Don&apos;t have an account?{' '}
                    <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">Create one</Link>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <Field name="email" label="Email address" type="email" autoComplete="email" value={formData.email} onChange={handleChange} required placeholder="you@example.com" />
                <Field name="password" label="Password" type="password" autoComplete="current-password" value={formData.password} onChange={handleChange} required placeholder="••••••••" />
                {error && <Alert tone="danger">{error}</Alert>}
                <Button type="submit" loading={loading} iconRight={ArrowRight} className="w-full" size="lg">
                    Log in
                </Button>
            </form>
        </AuthShell>
    );
};

export default Login;
