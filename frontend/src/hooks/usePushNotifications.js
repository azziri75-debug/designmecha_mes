import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../lib/api';

// Base64Url 디코딩 유틸리티
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function uint8ArrayToBase64Url(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isIosNonStandalone() {
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return isIos && !isStandalone;
}

export default function usePushNotifications(userId) {
    const isSupported = typeof window !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;

    const isSubscribedRef = useRef(false);
    const [permission, setPermission] = useState(
        typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'default'
    );
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subscribing, setSubscribing] = useState(false);

    const syncSubscription = useCallback(async ({ requestPermission = false } = {}) => {
        if (!userId || !isSupported) {
            return { ok: false, reason: 'unsupported', message: '이 브라우저는 웹 푸시 알림을 지원하지 않습니다.' };
        }

        if (isIosNonStandalone() && requestPermission) {
            return {
                ok: false,
                reason: 'ios_pwa_required',
                message: 'iPhone/iPad에서는 Safari 공유 버튼 → "홈 화면에 추가"로 앱을 설치한 뒤 실행하면 알림을 받을 수 있습니다.',
            };
        }

        try {
            await navigator.serviceWorker.register('/sw.js');
            const registration = await navigator.serviceWorker.ready;

            let currentPerm = window.Notification.permission;
            if (requestPermission && currentPerm === 'default') {
                currentPerm = await window.Notification.requestPermission();
            }
            setPermission(currentPerm);

            if (currentPerm !== 'granted') {
                setIsSubscribed(false);
                isSubscribedRef.current = false;
                return {
                    ok: false,
                    reason: currentPerm === 'denied' ? 'denied' : 'not_granted',
                    message: currentPerm === 'denied'
                        ? '브라우저 알림 권한이 차단되어 있습니다. 주소창/설정에서 이 사이트의 알림 권한을 "허용"으로 변경해 주세요.'
                        : '알림 권한이 허용되지 않았습니다.',
                };
            }

            // VAPID Public Key 조회 (프론트 .env 우선, 없으면 백엔드 API)
            let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!publicKey || publicKey.includes('YOUR_VAPID') || publicKey === '""' || publicKey === "''") {
                const response = await api.get('/notifications/vapid-public-key');
                publicKey = response.data?.public_key;
            }
            publicKey = publicKey ? publicKey.replace(/['"]/g, '').trim() : '';

            if (!publicKey) {
                console.warn('No valid VAPID Public Key found. Subscription aborted.');
                return { ok: false, reason: 'no_vapid', message: '서버에 푸시 키(VAPID)가 설정되어 있지 않습니다.' };
            }

            const applicationServerKey = urlBase64ToUint8Array(publicKey);
            let subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                const k1 = subscription.getKey('p256dh');
                const k2 = subscription.getKey('auth');
                if (!k1 || !k2) {
                    await subscription.unsubscribe();
                    subscription = null;
                }
            }

            if (!subscription) {
                try {
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey,
                    });
                } catch (subErr) {
                    // 기존 키 불일치 등 오류 시 기존 구독 정리 후 재시도
                    const stale = await registration.pushManager.getSubscription();
                    if (stale) {
                        await stale.unsubscribe();
                    }
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey,
                    });
                }
            }

            const p256dh = uint8ArrayToBase64Url(subscription.getKey('p256dh'));
            const auth = uint8ArrayToBase64Url(subscription.getKey('auth'));

            const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            const deviceType = isMobile ? 'Mobile' : 'Desktop';

            await api.post('/notifications/subscribe', {
                endpoint: subscription.endpoint,
                p256dh,
                auth,
                device_type: deviceType,
            });

            isSubscribedRef.current = true;
            setIsSubscribed(true);
            return { ok: true, deviceType };
        } catch (error) {
            console.error('Push notification registration failed', error);
            return { ok: false, reason: 'error', message: error?.message || '푸시 알림 등록 중 오류가 발생했습니다.' };
        }
    }, [userId, isSupported]);

    useEffect(() => {
        isSubscribedRef.current = false;
        setIsSubscribed(false);
        if (!userId || !isSupported) return;

        setPermission(window.Notification.permission);

        const timer = setTimeout(() => {
            if (!isSubscribedRef.current) {
                const perm = window.Notification.permission;
                // granted면 조용히 동기화, default면 1회 권한 요청 시도(모바일 제스처 제한 시 조용히 실패 허용)
                if (perm === 'granted' || perm === 'default') {
                    syncSubscription({ requestPermission: perm === 'default' });
                }
            }
        }, 1200);

        return () => clearTimeout(timer);
    }, [userId, isSupported, syncSubscription]);

    const subscribeNow = useCallback(async () => {
        setSubscribing(true);
        try {
            return await syncSubscription({ requestPermission: true });
        } finally {
            setSubscribing(false);
        }
    }, [syncSubscription]);

    const sendTestNotification = useCallback(async () => {
        const res = await api.post('/notifications/test');
        return res.data;
    }, []);

    return {
        supported: isSupported,
        permission,
        isSubscribed,
        subscribing,
        subscribeNow,
        sendTestNotification,
    };
}
