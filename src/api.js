import axios from 'axios';

const api = axios.create({
    baseURL: '/api' // Proxied to localhost:3000
});

export const request = async (method, url, data = null) => {
    try {
        const token = localStorage.getItem('authToken');
        const config = {
            method,
            url,
            data,
            headers: {}
        };
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await api(config);
        return response.data;
    } catch (error) {
        console.error('API Error:', error);
        throw error.response ? error.response.data : error;
    }
};

export default api;
