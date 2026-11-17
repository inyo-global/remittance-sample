import { useState, type ChangeEvent, type FormEvent } from 'react';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import type { AuthResponse, User } from '../../types';

export interface LoginProps {
    onLogin: (user: User) => void | Promise<void>;
}

export function useLogin({ onLogin }: LoginProps) {
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

    return { formData, loading, error, handleChange, handleSubmit };
}

export type LoginViewProps = ReturnType<typeof useLogin>;
