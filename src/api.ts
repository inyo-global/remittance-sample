import axios, { AxiosError, type AxiosRequestConfig, type Method } from 'axios';

// All calls go to the local BFF (server.js), which holds the Inyo credentials.
// Vite proxies /api -> http://localhost:3001 in development.
const api = axios.create({ baseURL: '/api' });

export type RequestOptions = Omit<AxiosRequestConfig, 'method' | 'url' | 'data'>;

/**
 * Calls the BFF and returns the response body. On failure it throws the BFF's error body when
 * there is one (see `errorMessage` in lib/format), otherwise the axios error itself.
 */
export const request = async <T = unknown>(method: Method, url: string, data: unknown = null, options: RequestOptions = {}): Promise<T> => {
    try {
        const token = localStorage.getItem('authToken');
        const config: AxiosRequestConfig = { method, url, data, ...options, headers: { ...(options.headers || {}) } };
        if (token) config.headers!['Authorization'] = `Bearer ${token}`;
        const response = await api<T>(config);
        return response.data;
    } catch (error) {
        const axiosError = error as AxiosError<unknown>;
        // Session expired or token rejected: drop the local session and send the user to login.
        if (axiosError.response && (axiosError.response.status === 401 || axiosError.response.status === 403) && localStorage.getItem('authToken')) {
            const isAuthRoute = /\/(login|register)$/.test(url);
            if (!isAuthRoute && !url.startsWith('/beneficiaries/') && !url.startsWith('/transactions')) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('remittance_user');
                window.location.assign('/login');
            }
        }
        console.error('API Error:', error);
        throw axiosError.response ? axiosError.response.data : error;
    }
};

export default api;
