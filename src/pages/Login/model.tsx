import { useState, type ChangeEvent, type FormEvent } from 'react';
import { request } from '../../api';
import { useSession } from '../../hooks';
import { errorMessage } from '../../lib/format';
import { sessionStorage } from '../../lib/sessionStorage';
import type { AuthResponse, User } from '../../types';

export function useLogin() {
    const { login } = useSession();
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
            if (res.token) sessionStorage.saveToken(res.token);
            await login(userData);
        } catch (err) {
            setError(errorMessage(err, 'Login failed'));
        } finally {
            setLoading(false);
        }
    };

    return { formData, loading, error, handleChange, handleSubmit };
}

export type LoginViewProps = ReturnType<typeof useLogin>;
