import axios from 'axios';

const getBaseURL = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (!envUrl) return '/api/v1';
    
    // If we're on HTTPS, ensure the API URL also uses HTTPS or is protocol-relative
    if (window.location.protocol === 'https:' && envUrl.startsWith('http:')) {
        return envUrl.replace('http:', 'https:');
    }
    return envUrl;
};

const api = axios.create({
    baseURL: getBaseURL(),
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
