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

    // NAS 환경(역방향 프록시)에서는 상대 경로(/uploads/...)만으로도 이미지 접근이 가능함
    // VITE_API_URL이 설정되어 있다면 사용하되, Mixed Content 에러 방지를 위해 프로토콜 보정
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
        try {
            const urlObj = new URL(apiUrl, window.location.origin);
            // 만약 API URL이 http인데 현재 페이지가 https라면 https로 강제 변환
            let baseOrigin = urlObj.origin;
            if (baseOrigin.startsWith('http://') && window.location.protocol === 'https:') {
                baseOrigin = baseOrigin.replace('http://', 'https://');
            }
            return `${baseOrigin}${path.startsWith('/') ? path : '/' + path}`;
        } catch (e) {
            return path;
        }
    }

    // 기본적으로 상대 경로 반환 (동일 도메인 프록시 환경 대응)
    return path.startsWith('/') ? path : '/' + path;
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
