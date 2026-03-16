import axios from 'axios';

const api = axios.create({
    baseURL: '/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

// 어떤 환경변수가 들어오든 강제로 찌꺼기를 잘라내고 상대경로/HTTPS로 맞추는 절대 방어막
if (api.defaults.baseURL && api.defaults.baseURL.includes('http://')) {
    api.defaults.baseURL = api.defaults.baseURL.replace('http://dmmes.synology.me', '');
    api.defaults.baseURL = api.defaults.baseURL.replace('http://', 'https://');
}

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
