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

