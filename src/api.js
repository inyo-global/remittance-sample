import axios from 'axios';

// All calls go to the local BFF (server.js), which holds the Inyo credentials.
// Vite proxies /api -> http://localhost:3001 in development.
const api = axios.create({ baseURL: '/api' });

export const request = async (method, url, data = null, options = {}) => {
    try {
        const token = localStorage.getItem('authToken');
        const config = { method, url, data, ...options, headers: { ...(options.headers || {}) } };
        if (token) config.headers['Authorization'] = `Bearer ${token}`;
        const response = await api(config);
        return response.data;
    } catch (error) {
        // Session expired or token rejected: drop the local session and send the user to login.
        if (error.response && (error.response.status === 401 || error.response.status === 403) && localStorage.getItem('authToken')) {
            const isAuthRoute = /\/(login|register)$/.test(url);
            if (!isAuthRoute && !url.startsWith('/beneficiaries/') && !url.startsWith('/transactions')) {
                localStorage.removeItem('authToken');
                localStorage.removeItem('remittance_user');
                window.location.assign('/login');
            }
        }
        console.error('API Error:', error);
        throw error.response ? error.response.data : error;
    }
};

export default api;
