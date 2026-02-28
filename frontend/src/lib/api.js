import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add user identification header
api.interceptors.request.use(
    (config) => {
        const savedUser = localStorage.getItem('mes_user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (user && user.id) {
                    config.headers['X-User-ID'] = user.id.toString();
                }
            } catch (e) {
                console.error('Failed to parse mes_user from localStorage', e);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
