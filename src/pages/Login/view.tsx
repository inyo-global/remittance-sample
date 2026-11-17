import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthShell from '../../components/AuthShell';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import type { LoginViewProps } from './model';

export default function LoginView({ formData, loading, error, handleChange, handleSubmit }: LoginViewProps) {
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
}
