import axios from 'axios';

const api = axios.create({
    baseURL: '/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

// 어떤 환경변수가 들어오든 강제로 찌꺼기를 잘라내고 상대경로/HTTPS로 맞추는 절대 방어막
// 모든 하드코딩된 주소를 제거하고 상대 경로를 강제하는 전역 필터
// Forcefully remove any absolute domain if accidentally set via environment variables or elsewhere
if (api.defaults.baseURL) {
    // 특정 도메인 및 프로토콜 완전 제거
    api.defaults.baseURL = api.defaults.baseURL.replace(/^https?:\/\/dmmes\.synology\.me/, '');
    
    // Log the base URL for final verification in the browser console
    console.log('[API Settings] Current BaseURL:', api.defaults.baseURL);

    api.defaults.baseURL = api.defaults.baseURL.replace(/^https?:\/\/[^\/]+/, '');
    
    // 만약 여전히 절대 경로라면 강제로 /api/v1으로 설정 (NAS 환경 최적화)
    if (api.defaults.baseURL.startsWith('http')) {
        api.defaults.baseURL = '/api/v1';
    }
} else {
    api.defaults.baseURL = '/api/v1';
}

import { safeParseJSON } from './utils';

// Request interceptor to add user identification header
api.interceptors.request.use(
    (config) => {
        // [강제 HTTPS 변환 결계]
        // 어떤 컴포넌트에서든 http://dmmes.synology.me 로 통신을 시도하면 강제로 https:// 로 낚아챕니다.
        if (config.url && config.url.includes('http://dmmes.synology.me')) {
            config.url = config.url.replace('http://', 'https://');
        }
        if (config.baseURL && config.baseURL.includes('http://dmmes.synology.me')) {
            config.baseURL = config.baseURL.replace('http://', 'https://');
        }

        const savedUser = localStorage.getItem('mes_user') || localStorage.getItem('user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (user && user.id) {
                    config.headers['X-User-ID'] = user.id.toString();
                }
            } catch (e) {
                console.error('Failed to parse user session for header', e);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
