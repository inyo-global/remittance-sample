import { useState, type ChangeEvent, type FormEvent } from 'react';
import { request } from '../../api';
import { errorMessage } from '../../lib/format';
import { TEST_ADDRESS } from '../../lib/usStates';
import type { AuthResponse, User } from '../../types';

export interface SignupProps {
    onLogin: (user: User) => void | Promise<void>;
}

interface SignupForm {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    address: string;
    city: string;
    state: string;
    zipcode: string;
}

export function useSignup({ onLogin }: SignupProps) {
    const [formData, setFormData] = useState<SignupForm>({
        email: '', password: '', firstName: '', lastName: '', dateOfBirth: '', address: '', city: '', state: '', zipcode: '',
    });
    const [useTestAddress, setUseTestAddress] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const toggleTestAddress = (checked: boolean) => {
        setUseTestAddress(checked);
        setFormData((prev) => ({ ...prev, ...(checked ? TEST_ADDRESS : { address: '', city: '', state: '', zipcode: '' }) }));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await request<AuthResponse>('post', '/register', formData);
            if (res.token) localStorage.setItem('authToken', res.token);
            const userData: User = { ...res.user };
            if (userData.id && !userData.userId) userData.userId = userData.id;
            await onLogin(userData);
        } catch (err) {
            setError(errorMessage(err, 'Registration failed'));
        } finally {
            setLoading(false);
        }
    };

    return { formData, useTestAddress, loading, error, handleChange, toggleTestAddress, handleSubmit };
}

export type SignupViewProps = ReturnType<typeof useSignup>;
