import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function getImageUrl(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('data:')) return path;

    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
        try {
            const urlObj = new URL(apiUrl, window.location.origin);
            return `${urlObj.origin}${path.startsWith('/') ? path : '/' + path}`;
        } catch (e) {
            return path;
        }
    }
    return path;
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
