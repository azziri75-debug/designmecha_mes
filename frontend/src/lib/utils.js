import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function getImageUrl(path) {
    if (!path) return '';
    // 이미 완전한 URL이거나 data URI인 경우 그대로 반환
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
        // http:// 도메인이 포함된 경우 현재 접속 프로토콜에 맞게 변환 (Mixed Content 방지)
        if (path.startsWith('http://') && window.location.protocol === 'https:') {
            return path.replace('http://', 'https://');
        }
        return path;
    }

    // VITE_API_URL이 설정되어 있다면 사용하되, Mixed Content 에러 방지를 위해 상대 경로 최우선
    let apiUrl = import.meta.env.VITE_API_URL || '/api/v1';
    
    // apiUrl에서 도메인을 제거하여 상대 경로로 강제 변환
    if (apiUrl.startsWith('http')) {
        try {
            const urlObj = new URL(apiUrl, window.location.origin);
            apiUrl = urlObj.pathname;
        } catch (e) {
            apiUrl = '/api/v1';
        }
    }

    // path가 이미 /api/v1으로 시작하거나 API 경로인 경우 중복 방지
    let cleanPath = path;
    if (path.startsWith('/api/v1')) {
        cleanPath = path.replace('/api/v1', '');
    } else if (path.startsWith('api/v1')) {
        cleanPath = path.replace('api/v1', '');
    }

    // 만약 uploads/ 로 시작하고 이미 static/이 없다면 static/을 붙여줌
    // (백엔드 StaticFiles 마운트 경로가 /api/v1/static 이기 때문)
    if (cleanPath.includes('uploads/') && !cleanPath.includes('static/')) {
        const parts = cleanPath.split('uploads/');
        cleanPath = `/static/uploads/${parts[1]}`;
    }

    const normalizedApiUrl = (apiUrl === '/' || apiUrl === '') ? '/api/v1' : (apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl);
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

    return `${normalizedApiUrl}${normalizedPath}`;
}

export function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString();
}

export function toKoreanCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return '';
    const number = Math.floor(num);
    if (number === 0) return '영';

    const units = ['', '만', '억', '조'];
    const smallUnits = ['', '십', '백', '천'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

    let result = '';
    let unitIdx = 0;
    let tempNum = number;

    while (tempNum > 0) {
        let part = tempNum % 10000;
        let partStr = '';
        let digitIdx = 0;

        while (part > 0) {
            let digit = part % 10;
            if (digit > 0) {
                let s = digits[digit] + smallUnits[digitIdx];
                // '일십', '일백', '일천'에서 '일' 생략 (단, '일'만 있는 경우는 제외)
                if (digit === 1 && digitIdx > 0) {
                    s = smallUnits[digitIdx];
                }
                partStr = s + partStr;
            }
            part = Math.floor(part / 10);
            digitIdx++;
        }

        if (partStr) {
            result = partStr + units[unitIdx] + result;
        }

        tempNum = Math.floor(tempNum / 10000);
        unitIdx++;
    }

    return `일금 ${result}원정`;
}
